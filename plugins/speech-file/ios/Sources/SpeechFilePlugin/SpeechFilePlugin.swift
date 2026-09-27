import AVFoundation
import Capacitor
import Foundation

/// Writes an AVSpeechSynthesizer narration to an audio file on the device.
///
/// `AVSpeechSynthesizer.write(_:toBufferCallback:)` delivers PCM buffers (it does
/// not play them). Those buffers are appended to a WAV file, then exported to
/// AAC `.m4a` for the share sheet. If AAC export fails, the WAV is returned
/// so the recap can still be shared.
@objc(SpeechFilePlugin)
public class SpeechFilePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechFilePlugin"
    public let jsName = "SpeechFile"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "synthesize", returnType: CAPPluginReturnPromise)
    ]

    private var active: RecapSpeechWriter?

    @objc func synthesize(_ call: CAPPluginCall) {
        let raw = call.getString("text") ?? ""
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            call.reject("Nothing to narrate")
            return
        }

        active?.cancel()
        let writer = RecapSpeechWriter()
        active = writer
        writer.start(text: text) { [weak self] result in
            if self?.active === writer {
                self?.active = nil
            }
            switch result {
            case .success(let file):
                call.resolve([
                    "uri": file.url.absoluteString,
                    "voice": file.voiceName,
                    "quality": file.quality,
                    "truncated": false,
                    "mimeType": file.mimeType
                ])
            case .failure(let error):
                call.reject(error.localizedDescription)
            }
        }
    }
}

private struct SpeechFileOutput {
    let url: URL
    let voiceName: String
    let quality: String
    let mimeType: String
}

private enum SpeechVoicePicker {
    private static let preferredNames = [
        "Ava", "Zoe", "Evan", "Nathan", "Nicky",
        "Samantha", "Allison", "Tom", "Susan"
    ]

    static func pick() -> AVSpeechSynthesisVoice? {
        let voices = AVSpeechSynthesisVoice.speechVoices().filter { voice in
            voice.language == "en-US" || voice.language.hasPrefix("en-US")
        }
        guard !voices.isEmpty else {
            return AVSpeechSynthesisVoice(language: "en-US")
        }
        return voices.max { lhs, rhs in
            let leftQuality = qualityRank(lhs)
            let rightQuality = qualityRank(rhs)
            if leftQuality != rightQuality {
                return leftQuality < rightQuality
            }
            return nameRank(lhs) < nameRank(rhs)
        }
    }

    static func qualityLabel(_ voice: AVSpeechSynthesisVoice?) -> String {
        guard let voice else { return "default" }
        if qualityRank(voice) >= 3 { return "premium" }
        if voice.quality == .enhanced { return "enhanced" }
        return "default"
    }

    /// Premium voices shipped with iOS 16. Enhanced voices are older.
    private static func qualityRank(_ voice: AVSpeechSynthesisVoice) -> Int {
        if #available(iOS 16.0, *) {
            if voice.quality == .premium {
                return 3
            }
        }
        if voice.quality == .enhanced {
            return 2
        }
        return 1
    }

    private static func nameRank(_ voice: AVSpeechSynthesisVoice) -> Int {
        for (index, name) in preferredNames.enumerated() {
            if voice.name.range(of: name, options: .caseInsensitive) != nil {
                return preferredNames.count - index
            }
        }
        return 0
    }
}

/// AVSpeechSynthesizer.write can stop early on very long utterances, so the
/// script is split on paragraph, sentence, or word boundaries.
private enum SpeechChunker {
    static func chunks(from text: String, limit: Int = 1400) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        if trimmed.count <= limit {
            return [trimmed]
        }

        var pieces: [String] = []
        var start = trimmed.startIndex
        while start < trimmed.endIndex {
            let remaining = trimmed.distance(from: start, to: trimmed.endIndex)
            if remaining <= limit {
                let tail = String(trimmed[start...]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !tail.isEmpty {
                    pieces.append(tail)
                }
                break
            }

            let maxEnd = trimmed.index(start, offsetBy: limit)
            let window = trimmed[start..<maxEnd]
            var end = maxEnd
            if let range = window.range(of: "\n\n", options: .backwards) {
                end = range.lowerBound
            } else if let range = window.range(of: ". ", options: .backwards) {
                end = range.upperBound
            } else if let range = window.range(of: " ", options: .backwards) {
                end = range.lowerBound
            }
            if end <= start {
                end = maxEnd
            }

            let piece = String(trimmed[start..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
            if !piece.isEmpty {
                pieces.append(piece)
            }
            start = end
            while start < trimmed.endIndex, trimmed[start].isWhitespace {
                start = trimmed.index(after: start)
            }
        }
        return pieces
    }
}

private final class RecapSpeechWriter: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private let writeQueue = DispatchQueue(label: "com.brantb73.tournify.speech.write")
    private var wavFile: AVAudioFile?
    private var wavURL: URL?
    private var m4aURL: URL?
    private var chunks: [String] = []
    private var voice: AVSpeechSynthesisVoice?
    private var framesWritten: AVAudioFrameCount = 0
    /// Highest chunk index already handed off to the next step. -1 before any.
    private var finishedThrough = -1
    private var framesInChunk: AVAudioFrameCount = 0
    private var chunkByUtterance: [ObjectIdentifier: Int] = [:]
    private var completion: ((Result<SpeechFileOutput, Error>) -> Void)?
    private var didComplete = false
    private var cancelled = false
    private var failed = false
    private var timeoutItem: DispatchWorkItem?

    func start(text: String, completion: @escaping (Result<SpeechFileOutput, Error>) -> Void) {
        self.completion = completion
        DispatchQueue.main.async { [weak self] in
            self?.begin(text: text)
        }
    }

    func cancel() {
        cancelled = true
        timeoutItem?.cancel()
        DispatchQueue.main.async { [weak self] in
            self?.synthesizer.stopSpeaking(at: .immediate)
        }
        finish(.failure(speechError("Speech cancelled", code: 2)))
    }

    private func begin(text: String) {
        guard !cancelled else { return }
        voice = SpeechVoicePicker.pick()
        chunks = SpeechChunker.chunks(from: text)
        guard !chunks.isEmpty else {
            finish(.failure(speechError("Nothing to narrate", code: 1)))
            return
        }

        let id = UUID().uuidString
        let folder = FileManager.default.temporaryDirectory
        wavURL = folder.appendingPathComponent("tournify-recap-\(id).wav")
        m4aURL = folder.appendingPathComponent("tournify-recap-\(id).m4a")
        removeStaleRecaps(keeping: id, in: folder)

        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers])
        try? session.setActive(true)

        synthesizer.delegate = self
        armTimeout()
        speakChunk(at: 0)
    }

    private func speakChunk(at index: Int) {
        guard !didComplete, !cancelled, !failed else { return }
        guard index >= 0, index < chunks.count else {
            closeAndConvert()
            return
        }
        let utterance = AVSpeechUtterance(string: chunks[index])
        utterance.voice = voice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.96
        utterance.pitchMultiplier = 1.0
        utterance.preUtteranceDelay = index == 0 ? 0.05 : 0.15
        writeQueue.sync {
            self.framesInChunk = 0
            self.chunkByUtterance[ObjectIdentifier(utterance)] = index
        }
        synthesizer.write(utterance) { [weak self] buffer in
            guard let self else { return }
            self.writeQueue.sync {
                if self.append(buffer) {
                    self.markChunkFinished(index)
                }
            }
        }
    }

    /// Called on `writeQueue`. Returns true when this buffer ends the chunk.
    /// A later `didFinish` for the same index is ignored by `markChunkFinished`.
    private func append(_ buffer: AVAudioBuffer) -> Bool {
        guard !didComplete, !cancelled, !failed else { return false }
        guard let pcm = buffer as? AVAudioPCMBuffer else { return false }
        if pcm.frameLength == 0 {
            return framesInChunk > 0
        }
        guard let wavURL else { return false }
        do {
            if wavFile == nil {
                let format = pcm.format
                if format.commonFormat == .other {
                    wavFile = try AVAudioFile(forWriting: wavURL, settings: format.settings)
                } else {
                    wavFile = try AVAudioFile(
                        forWriting: wavURL,
                        settings: format.settings,
                        commonFormat: format.commonFormat,
                        interleaved: format.isInterleaved
                    )
                }
            }
            try wavFile?.write(from: pcm)
            framesWritten += pcm.frameLength
            framesInChunk += pcm.frameLength
            return false
        } catch {
            failed = true
            finish(.failure(error))
            return false
        }
    }

    /// First completion signal for this chunk wins. `index` is captured when
    /// that chunk started, so a late delegate call cannot skip ahead.
    private func markChunkFinished(_ index: Int) {
        guard !didComplete, !cancelled, !failed else { return }
        guard index == finishedThrough + 1 else { return }
        finishedThrough = index
        let next = index + 1
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if next < self.chunks.count {
                self.speakChunk(at: next)
            } else {
                self.closeAndConvert()
            }
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let key = ObjectIdentifier(utterance)
        writeQueue.async { [weak self] in
            guard let self, self.framesInChunk > 0 else { return }
            let index = self.chunkByUtterance[key] ?? -1
            self.markChunkFinished(index)
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        if cancelled {
            finish(.failure(speechError("Speech cancelled", code: 2)))
        }
    }

    private func closeAndConvert() {
        writeQueue.async { [weak self] in
            guard let self, !self.didComplete else { return }
            self.wavFile = nil
            guard self.framesWritten > 0, let wavURL = self.wavURL, let m4aURL = self.m4aURL else {
                self.finish(.failure(speechError(
                    "The iPhone did not produce audio. Open Settings → Accessibility → Spoken Content → Voices → English, download an Enhanced or Premium voice, then try again.",
                    code: 3
                )))
                return
            }
            let voiceName = self.voice?.name ?? "English (US)"
            let quality = SpeechVoicePicker.qualityLabel(self.voice)
            SpeechAudioConverter.convertToM4A(wavURL: wavURL, m4aURL: m4aURL) { result in
                switch result {
                case .success(let url):
                    try? FileManager.default.removeItem(at: wavURL)
                    self.finish(.success(SpeechFileOutput(
                        url: url,
                        voiceName: voiceName,
                        quality: quality,
                        mimeType: "audio/mp4"
                    )))
                case .failure:
                    self.finish(.success(SpeechFileOutput(
                        url: wavURL,
                        voiceName: voiceName,
                        quality: quality,
                        mimeType: "audio/wav"
                    )))
                }
            }
        }
    }

    private func armTimeout() {
        timeoutItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.synthesizer.stopSpeaking(at: .immediate)
            self?.finish(.failure(speechError(
                "The recap took too long to generate. Shorten the script and try again.",
                code: 8
            )))
        }
        timeoutItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 180, execute: work)
    }

    private func finish(_ result: Result<SpeechFileOutput, Error>) {
        writeQueue.async { [weak self] in
            guard let self else { return }
            guard !self.didComplete else { return }
            self.didComplete = true
            self.timeoutItem?.cancel()
            self.wavFile = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
            let callback = self.completion
            self.completion = nil
            DispatchQueue.main.async {
                callback?(result)
            }
        }
    }

    private func removeStaleRecaps(keeping id: String, in folder: URL) {
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: folder.path) else { return }
        for name in names where name.hasPrefix("tournify-recap-") && !name.contains(id) {
            try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
        }
    }
}

private enum SpeechAudioConverter {
    static func convertToM4A(wavURL: URL, m4aURL: URL, completion: @escaping (Result<URL, Error>) -> Void) {
        if FileManager.default.fileExists(atPath: m4aURL.path) {
            try? FileManager.default.removeItem(at: m4aURL)
        }
        let asset = AVURLAsset(url: wavURL, options: nil)
        guard let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            completion(.failure(speechError("Could not create an audio export session", code: 4)))
            return
        }
        exporter.outputURL = m4aURL
        exporter.outputFileType = .m4a
        exporter.exportAsynchronously {
            switch exporter.status {
            case .completed:
                completion(.success(m4aURL))
            case .failed:
                let message = exporter.error?.localizedDescription ?? "Could not convert the recap to an audio file"
                completion(.failure(speechError(message, code: 5)))
            case .cancelled:
                completion(.failure(speechError("Audio export was cancelled", code: 6)))
            default:
                completion(.failure(speechError("Audio export did not finish", code: 7)))
            }
        }
    }
}

private func speechError(_ message: String, code: Int) -> NSError {
    NSError(domain: "TournifySpeechFile", code: code, userInfo: [
        NSLocalizedDescriptionKey: message
    ])
}
