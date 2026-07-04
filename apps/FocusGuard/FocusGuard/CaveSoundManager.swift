import Foundation
import AVFoundation
import MediaPlayer

/// CaveSoundManager (가벼운 오디오 로직 복구)
/// - 기존에 안정적으로 동작하던 환경음(동굴 낙수 소리, 차분한 대나무 바람) 재생 로직 복구
/// - Now Playing 풀스크린 앨범아트 강제 연동용 무음 루프는 제거하여 랙/튕김의 원인을 원천 차단
/// - Strict Concurrency 하에서도 안전하도록 타이머 핸들러의 Actor isolation을 Task {@MainActor in}으로 보장
@MainActor
final class CaveSoundManager {
    static let shared = CaveSoundManager()
    
    private var audioEngine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?
    private var reverbNode: AVAudioUnitReverb?
    private var eqNode: AVAudioUnitEQ?
    
    private var dripTimer: Timer?
    private var windTimer: Timer?
    private var windAngle: Double = 0.0
    private var currentSoundscape: String = "없음"
    
    private init() {
        setupAudioEngine()
        setupRemoteCommandCenter()
    }
    
    private func setupAudioEngine() {
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let reverb = AVAudioUnitReverb()
        let eq = AVAudioUnitEQ(numberOfBands: 1)
        
        engine.attach(player)
        engine.attach(reverb)
        engine.attach(eq)
        
        // 동굴 음향 리버브
        reverb.loadFactoryPreset(.largeHall)
        reverb.wetDryMix = 65
        
        // 바람소리 변조용 EQ
        let band = eq.bands[0]
        band.filterType = .bandPass
        band.bandwidth = 1.8
        band.frequency = 500.0
        band.bypass = false
        
        let monoFormat = AVAudioFormat(standardFormatWithSampleRate: 44100.0, channels: 1)
        
        engine.connect(player, to: eq, format: monoFormat)
        engine.connect(eq, to: reverb, format: monoFormat)
        engine.connect(reverb, to: engine.mainMixerNode, format: nil)
        
        self.audioEngine = engine
        self.playerNode = player
        self.reverbNode = reverb
        self.eqNode = eq
    }
    
    func start(soundscape: String) {
        stop()
        currentSoundscape = soundscape
        guard soundscape != "없음" else { return }
        
        guard let engine = audioEngine, let player = playerNode else { return }
        
        // 재생에 적합하도록 AVAudioSession 설정
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            print("[CaveSoundManager] AVAudioSession config failed: \(error)")
        }
        
        if !engine.isRunning {
            do {
                try engine.start()
            } catch {
                print("[CaveSoundManager] Failed to start AVAudioEngine: \(error)")
                return
            }
        }
        
        if soundscape == "동굴 낙수 소리" {
            reverbNode?.wetDryMix = 75
            eqNode?.bands[0].bypass = true
            
            dripTimer = Timer.scheduledTimer(withTimeInterval: 2.2, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.playRandomDrip()
                }
            }
            playRandomDrip()
            
        } else if soundscape == "차분한 대나무 바람" {
            reverbNode?.wetDryMix = 45
            eqNode?.bands[0].bypass = false
            
            if let noiseBuffer = generateNoiseBuffer() {
                player.play()
                player.scheduleBuffer(noiseBuffer, at: nil, options: .loops, completionHandler: nil)
            }
            
            windAngle = 0.0
            windTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self = self else { return }
                    self.windAngle += 0.04
                    let frequency = 400.0 + 180.0 * sin(self.windAngle)
                    self.eqNode?.bands[0].frequency = Float(frequency)
                }
            }
        }
    }
    
    func stop() {
        dripTimer?.invalidate()
        dripTimer = nil
        
        windTimer?.invalidate()
        windTimer = nil
        
        playerNode?.stop()
        audioEngine?.stop()
        currentSoundscape = "없음"
    }
    
    private func playRandomDrip() {
        guard let engine = audioEngine, engine.isRunning, let player = playerNode else { return }
        let pitchRandom = Float.random(in: 0.85...1.15)
        if let dripBuffer = generateDripBuffer(pitchScale: pitchRandom) {
            player.scheduleBuffer(dripBuffer, at: nil, options: [], completionHandler: nil)
            if !player.isPlaying {
                player.play()
            }
        }
    }
    
    private func generateDripBuffer(pitchScale: Float) -> AVAudioPCMBuffer? {
        let sampleRate: Float = 44100.0
        let duration: Float = 0.14 / pitchScale
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        
        guard let format = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return nil
        }
        
        buffer.frameLength = frameCount
        let channels = buffer.floatChannelData
        guard let channelData = channels?[0] else { return nil }
        
        for i in 0..<Int(frameCount) {
            let t = Float(i) / sampleRate
            let startFreq: Float = 1300.0 * pitchScale
            let endFreq: Float = 350.0 * pitchScale
            let freq = endFreq + (startFreq - endFreq) * exp(-t * 55.0)
            let amp = exp(-t * 16.0) * sin(2.0 * Float.pi * freq * t)
            channelData[i] = amp
        }
        return buffer
    }
    
    private func generateNoiseBuffer() -> AVAudioPCMBuffer? {
        let sampleRate: Float = 44100.0
        let duration: Float = 3.0
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        
        guard let format = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return nil
        }
        
        buffer.frameLength = frameCount
        let channels = buffer.floatChannelData
        guard let channelData = channels?[0] else { return nil }
        
        for i in 0..<Int(frameCount) {
            channelData[i] = Float.random(in: -0.04...0.04)
        }
        return buffer
    }
    
    private func setupRemoteCommandCenter() {
        let cc = MPRemoteCommandCenter.shared()
        cc.playCommand.isEnabled = true
        cc.playCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            Task { @MainActor in
                if self.currentSoundscape != "없음" {
                    self.start(soundscape: self.currentSoundscape)
                }
            }
            return .success
        }
        cc.pauseCommand.isEnabled = true
        cc.pauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            Task { @MainActor in
                self.stop()
            }
            return .success
        }
    }
}
