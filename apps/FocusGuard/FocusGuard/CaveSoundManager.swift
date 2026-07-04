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
        } else if soundscape == "호랑이 기운 소리" {
            reverbNode?.wetDryMix = 50
            eqNode?.bands[0].bypass = true
            
            if let tigerBuffer = generateTigerBreathBuffer() {
                player.play()
                player.scheduleBuffer(tigerBuffer, at: nil, options: .loops, completionHandler: nil)
            }
            
        } else if soundscape == "청룡 뇌우 소리" {
            reverbNode?.wetDryMix = 70
            eqNode?.bands[0].bypass = true
            
            if let rainBuffer = generateRainBuffer() {
                player.play()
                player.scheduleBuffer(rainBuffer, at: nil, options: .loops, completionHandler: nil)
            }
            
            dripTimer = Timer.scheduledTimer(withTimeInterval: 12.0, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.playThunderStrike()
                }
            }
            playThunderStrike()
            
        } else if soundscape == "산사 목탁과 종소리" {
            reverbNode?.wetDryMix = 80
            eqNode?.bands[0].bypass = true
            
            dripTimer = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.playWoodBlockStrike()
                }
            }
            playWoodBlockStrike()
            
            windTimer = Timer.scheduledTimer(withTimeInterval: 14.0, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.playSubtleTempleBell()
                }
            }
            playSubtleTempleBell()
        }
    }
    
    func stop() {
        dripTimer?.invalidate()
        dripTimer = nil
        
        windTimer?.invalidate()
        windTimer = nil
        
        playerNode?.stop()
        playerNode?.reset() // 내부 스케줄링 대기 큐 완전 Flush
        audioEngine?.stop()
        currentSoundscape = "없음"
    }
    
    // MARK: - 내공 돌파 (1각 / 1식경) 맑고 깊은 명상 종소리 & 햅틱 연동
    func playTempleBell() {
        guard let engine = audioEngine, let player = playerNode else { return }
        
        // 햅틱 발동 (진원진기가 뚫리는 묵직한 이중 파동)
        let generator = UIImpactFeedbackGenerator(style: .rigid)
        generator.prepare()
        generator.impactOccurred()
        
        // 0.15초 뒤 두 번째 햅틱 파동
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            let gen2 = UIImpactFeedbackGenerator(style: .medium)
            gen2.impactOccurred()
        }
        
        if !engine.isRunning {
            try? engine.start()
        }
        
        if let bellBuffer = generateTempleBellBuffer() {
            player.scheduleBuffer(bellBuffer, at: nil, options: [], completionHandler: nil)
            if !player.isPlaying {
                player.play()
            }
        }
    }
    
    private func generateTempleBellBuffer() -> AVAudioPCMBuffer? {
        let sampleRate: Float = 44100.0
        let duration: Float = 4.5 // 4.5초 긴 여운
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
            
            // 맥놀이(Beating) 동양종 주파수 합성 (기본 주파수 330Hz)
            let f1: Float = 330.0
            let f2: Float = 331.5
            let overtone1: Float = 660.0
            let overtone2: Float = 990.0
            
            let fundamental = sin(2.0 * Float.pi * f1 * t) + sin(2.0 * Float.pi * f2 * t)
            let high1 = 0.35 * sin(2.0 * Float.pi * overtone1 * t) * exp(-t * 2.5) // 배음 감쇄
            let high2 = 0.15 * sin(2.0 * Float.pi * overtone2 * t) * exp(-t * 4.0)
            
            let decay = exp(-t * 0.75) // 전체 잔향 곡선
            
            let sample = (fundamental * 0.5 + high1 + high2) * decay * 0.35
            channelData[i] = sample
        }
        return buffer
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
    
    
    // MARK: - 호랑이 기운 숨결음 합성 (저주파 진동 + LFO)
    private func generateTigerBreathBuffer() -> AVAudioPCMBuffer? {
        let sampleRate: Float = 44100.0
        let duration: Float = 10.0 // 10초 무한 루프용 대형 버퍼
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
            
            // 호랑이 맹수 목청 떨림 LFO (더 빠른 7.5Hz 진폭 변조로 고동감 부여)
            let lfo = 0.55 + 0.45 * sin(2.0 * Float.pi * 7.5 * t)
            
            // 웅장한 가릉거림 호흡 주기 (6초 대형 호흡 루프)
            let breathCycle = 0.35 + 0.65 * sin(2.0 * Float.pi * (1.0 / 6.0) * t)
            
            // 용맹한 가릉거림 노이즈 합성
            let noise = Float.random(in: -0.18...0.18)
            
            // 주파수 상승: 모바일 스피커 대응을 위해 75Hz에서 165Hz 대역으로 부스팅하여 선명하게 출력
            let lowFrequencyComponent = sin(2.0 * Float.pi * 165.0 * t) * 0.5
            
            // 볼륨을 0.12에서 0.65로 대폭 강화
            let sample = (noise * 0.35 * lfo + lowFrequencyComponent * 0.65) * breathCycle * 0.65
            channelData[i] = sample
        }
        return buffer
    }
    
    // MARK: - 청룡 뇌우 빗소리 합성 (화이트 노이즈 밴드패스 효과)
    private func generateRainBuffer() -> AVAudioPCMBuffer? {
        let sampleRate: Float = 44100.0
        let duration: Float = 5.0
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        
        guard let format = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return nil
        }
        
        buffer.frameLength = frameCount
        let channels = buffer.floatChannelData
        guard let channelData = channels?[0] else { return nil }
        
        var filterState: Float = 0.0
        for i in 0..<Int(frameCount) {
            let noise = Float.random(in: -0.05...0.05)
            // 소나기가 메인 번개를 가리지 않도록 빗소리 볼륨 계수를 0.35에서 0.12로 경감하여 조화롭게 백그라운드화
            filterState = filterState * 0.85 + noise * 0.15
            channelData[i] = filterState * 0.12
        }
        return buffer
    }
    
    // MARK: - 저멀리 치는 나지막한 천둥소리 합성 재생
    private func playThunderStrike() {
        guard let engine = audioEngine, engine.isRunning, let player = playerNode else { return }
        
        let sampleRate: Float = 44100.0
        let duration: Float = 4.0 // 4초 천둥 여운
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        
        guard let format = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return
        }
        
        buffer.frameLength = frameCount
        let channels = buffer.floatChannelData
        guard let channelData = channels?[0] else { return }
        
        for i in 0..<Int(frameCount) {
            let t = Float(i) / sampleRate
            
            // 천둥의 번개 꽝 치는 지글거리는 노이즈 (비율 4배 증폭)
            let noise = Float.random(in: -0.22...0.22)
            
            // 모바일 스피커 대응을 위해 rumble 주파수를 45Hz/70Hz에서 120Hz/180Hz로 상향 튜닝
            let rumble = sin(2.0 * Float.pi * 120.0 * t) * 0.6 + sin(2.0 * Float.pi * 180.0 * t) * 0.4
            
            let strikeDecay = exp(-t * 1.5)
            let rumbleDecay = exp(-t * 0.7)
            
            // 쿵쾅 거리는 천둥소리 볼륨을 0.15에서 0.85로 대폭 강화
            let sample = (noise * strikeDecay * 0.68 + rumble * rumbleDecay * 0.32) * 0.85
            channelData[i] = sample
        }
        
        player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
    }
    
    // MARK: - 목탁 소리 타격음 합성 재생
    private func playWoodBlockStrike() {
        guard let engine = audioEngine, engine.isRunning, let player = playerNode else { return }
        
        let sampleRate: Float = 44100.0
        let duration: Float = 0.25 // 목탁은 짧고 통통 튐
        let frameCount = AVAudioFrameCount(sampleRate * duration)
        
        guard let format = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return
        }
        
        buffer.frameLength = frameCount
        let channels = buffer.floatChannelData
        guard let channelData = channels?[0] else { return }
        
        for i in 0..<Int(frameCount) {
            let t = Float(i) / sampleRate
            
            // 목탁 고유 주파수 (나무의 공명 680Hz 및 1360Hz 배음)
            let freq1: Float = 680.0
            let freq2: Float = 1360.0
            
            let fundamental = sin(2.0 * Float.pi * freq1 * t)
            let overtone = 0.35 * sin(2.0 * Float.pi * freq2 * t) * exp(-t * 70.0)
            
            // 매우 가파른 지수 감쇄 (똑똑 굴리는 목탁 껍질 소리)
            let decay = exp(-t * 24.0)
            
            // 볼륨을 0.32에서 0.85로 크게 부스팅하여 선명하게 연주
            let sample = (fundamental + overtone) * decay * 0.85
            channelData[i] = sample
        }
        
        player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        
        // 중요: 플레이어 재생 노드 기동 보증 추가 (정지 상태일 때 소리가 재생되지 않는 버그 해결)
        if !player.isPlaying {
            player.play()
        }
    }
    
    // MARK: - 배경용 나지막한 종소리 재생
    private func playSubtleTempleBell() {
        guard let engine = audioEngine, engine.isRunning, let player = playerNode else { return }
        if let bellBuffer = generateTempleBellBuffer() {
            // 배경 범종 소리는 메인 알림보다 은은하게 믹스 (볼륨을 0.35에서 0.80으로 상향 조정)
            let frameCount = bellBuffer.frameLength
            let channels = bellBuffer.floatChannelData
            if let channelData = channels?[0] {
                for i in 0..<Int(frameCount) {
                    channelData[i] = channelData[i] * 0.80
                }
            }
            player.scheduleBuffer(bellBuffer, at: nil, options: [], completionHandler: nil)
            
            // 중요: 플레이어 재생 노드 기동 보증 추가 (종소리 연주 정상화)
            if !player.isPlaying {
                player.play()
            }
        }
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
