import Foundation
import AVFoundation
import MediaPlayer
import UIKit

/// CaveSoundManager (초저전력 H/W 가속 및 실시간 성취 연동 엔진)
/// - 오디오 엔진(AVAudioEngine)의 상시 구동을 배제하여 발열/배터리 소모를 극소화합니다.
/// - 수련 중 배경 효과음(호랑이, 청룡, 산사)은 오직 하드웨어 가속 AVAudioPlayer로 구동하며, 호랑이 포효 주기를 24초로 단축하여 정적을 제거했습니다.
/// - 단, 파일이 부재한 "동굴 낙수"와 "대나무 바람", 그리고 가장 엄숙하고 명징해야 하는 "내공 돌파 알림" 순간에만 실시간 리버브 합성 엔진을 구동합니다.
@MainActor
final class CaveSoundManager {
    static let shared = CaveSoundManager()
    
    // 오디오 합성 노드 (대나무/낙수 폴백 및 내공 돌파 알림용)
    private var audioEngine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?
    private var reverbNode: AVAudioUnitReverb?
    private var eqNode: AVAudioUnitEQ?
    
    // H/W 가속 재생 및 저전력 구동을 위한 AVAudioPlayer들 (실제 고음질 MP3 재생용)
    private var backgroundPlayer: AVAudioPlayer? // 루프 배경음 (빗소리 등)
    private var subBackgroundPlayer: AVAudioPlayer? // 이중 레이어 배경음
    private var thunderPlayer: AVAudioPlayer?    // 독립 격발: 천둥소리 전용 플레이어
    private var woodblockPlayer: AVAudioPlayer?  // 독립 격발: 목탁소리 전용 플레이어
    private var bellPlayer: AVAudioPlayer?       // 독립 격발: 범종소리 전용 플레이어
    private var tigerRoarPlayer: AVAudioPlayer?   // 독립 격발: 호랑이 포효용 플레이어
    
    private var dripTimer: Timer?
    private var windTimer: Timer?
    private var windAngle: Double = 0.0
    private var currentSoundscape: String = "없음"
    
    // 로컬 실제 백그라운드용 소스 다운로드 URL 정의 (빗소리와 천둥 기본 캐싱 유지)
    private let rainURL = "https://raw.githubusercontent.com/hiteshchoudhary/web-dev-exercise/master/07_sound_clips/sounds/rain.mp3"
    private let thunderURL = "https://raw.githubusercontent.com/hiteshchoudhary/web-dev-exercise/master/07_sound_clips/sounds/thunder.mp3"
    
    private init() {
        setupRemoteCommandCenter()
        triggerBackgroundCaching()
    }
    
    private func setupAudioEngineIfNeeded() {
        guard audioEngine == nil else { return }
        
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let reverb = AVAudioUnitReverb()
        let eq = AVAudioUnitEQ(numberOfBands: 1)
        
        engine.attach(player)
        engine.attach(reverb)
        engine.attach(eq)
        
        reverb.loadFactoryPreset(.largeHall)
        reverb.wetDryMix = 65
        
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
    
    // MARK: - 비동기 다운로드 및 로컬 캐싱 시스템
    private func triggerBackgroundCaching() {
        Task {
            await downloadFileIfNeeded(from: rainURL, filename: "rain_loop.mp3")
            await downloadFileIfNeeded(from: thunderURL, filename: "thunder.mp3")
            print("[CaveSoundManager] Background sound caching task completed.")
        }
    }
    
    private func downloadFileIfNeeded(from urlString: String, filename: String) async {
        guard let url = URL(string: urlString) else { return }
        let fileManager = FileManager.default
        let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let destinationURL = documentsURL.appendingPathComponent(filename)
        
        if fileManager.fileExists(atPath: destinationURL.path) {
            return
        }
        
        do {
            let (tempURL, _) = try await URLSession.shared.download(from: url)
            if fileManager.fileExists(atPath: destinationURL.path) {
                try? fileManager.removeItem(at: destinationURL)
            }
            try fileManager.moveItem(at: tempURL, to: destinationURL)
            print("[CaveSoundManager] Successfully cached sound file: \(filename)")
        } catch {
            print("[CaveSoundManager] Sound download failed for \(filename): \(error.localizedDescription)")
        }
    }
    
    private func getCachedFileURL(filename: String) -> URL? {
        let fileManager = FileManager.default
        let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let destinationURL = documentsURL.appendingPathComponent(filename)
        return fileManager.fileExists(atPath: destinationURL.path) ? destinationURL : nil
    }
    
    private func getBundleOrCachedURL(filename: String) -> URL? {
        let nameOnly = (filename as NSString).deletingPathExtension
        let extOnly = (filename as NSString).pathExtension
        if let bundleURL = Bundle.main.url(forResource: nameOnly, withExtension: extOnly) {
            return bundleURL
        }
        
        let localPath = "/Users/juns/code/work/blackLAB/apps/FocusGuard/FocusGuard/\(filename)"
        if FileManager.default.fileExists(atPath: localPath) {
            return URL(fileURLWithPath: localPath)
        }
        
        return getCachedFileURL(filename: filename)
    }
    
    // MARK: - 사운드 테라피 시작
    func start(soundscape: String) {
        stop()
        currentSoundscape = soundscape
        guard soundscape != "없음" else { return }
        
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            print("[CaveSoundManager] AVAudioSession config failed: \(error)")
        }
        
        if soundscape == "동굴 낙수 소리" {
            // A. 실제 drip.mp3 파일 존재 시 H/W 가속 재생
            if let dripURL = getBundleOrCachedURL(filename: "drip.mp3") {
                backgroundPlayer = try? AVAudioPlayer(contentsOf: dripURL)
                backgroundPlayer?.numberOfLoops = -1
                backgroundPlayer?.volume = 0.25
                backgroundPlayer?.play()
            } else {
                // B. 파일 부재 시: 신디사이저 엔진 가동하여 실시간 낙수 합성음 폴백 재생
                setupAudioEngineIfNeeded()
                if let engine = audioEngine, playerNode != nil {
                    if !engine.isRunning { try? engine.start() }
                    reverbNode?.wetDryMix = 75
                    
                    dripTimer = Timer.scheduledTimer(withTimeInterval: 4.2, repeats: true) { [weak self] _ in
                        Task { @MainActor in
                            self?.playRandomDrip()
                        }
                    }
                    playRandomDrip()
                }
            }
            
        } else if soundscape == "차분한 대나무 바람" {
            // A. 실제 bamboo_wind.mp3 파일 존재 시 H/W 가속 재생
            if let windURL = getBundleOrCachedURL(filename: "bamboo_wind.mp3") {
                backgroundPlayer = try? AVAudioPlayer(contentsOf: windURL)
                backgroundPlayer?.numberOfLoops = -1
                backgroundPlayer?.volume = 0.40
                backgroundPlayer?.play()
            } else {
                // B. 파일 부재 시: 신디사이저 엔진 가동하여 실시간 대나무 바람 루프 재생
                setupAudioEngineIfNeeded()
                if let engine = audioEngine, let player = playerNode {
                    if !engine.isRunning { try? engine.start() }
                    reverbNode?.wetDryMix = 45
                    
                    if let noiseBuffer = generateNoiseBuffer() {
                        player.scheduleBuffer(noiseBuffer, at: nil, options: .loops, completionHandler: nil)
                        player.play()
                    }
                    
                    windAngle = 0.0
                    windTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
                        Task { @MainActor in
                            guard let self = self else { return }
                            self.windAngle += 0.08
                            let frequency = 400.0 + 180.0 * sin(self.windAngle)
                            self.eqNode?.bands[0].frequency = Float(frequency)
                        }
                    }
                }
            }
            
        } else if soundscape == "호랑이 기운 소리" {
            if let breathURL = getBundleOrCachedURL(filename: "tiger_breath.mp3") {
                backgroundPlayer = try? AVAudioPlayer(contentsOf: breathURL)
                backgroundPlayer?.numberOfLoops = -1
                backgroundPlayer?.volume = 0.70
                backgroundPlayer?.play()
            }
            
            // 호랑이 포효가 끝난 뒤 공백을 줄이기 위해 격발 주기를 40초에서 24초로 대폭 단축!
            dripTimer = Timer.scheduledTimer(withTimeInterval: 24.0, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.playActualTigerRoar()
                }
            }
            playActualTigerRoar()
            
        } else if soundscape == "청룡 뇌우 소리" {
            if let rainURL = getBundleOrCachedURL(filename: "rain_loop.mp3") {
                backgroundPlayer = try? AVAudioPlayer(contentsOf: rainURL)
                backgroundPlayer?.numberOfLoops = -1
                backgroundPlayer?.volume = 0.35
                backgroundPlayer?.play()
            }
            
            if let rumbleURL = getBundleOrCachedURL(filename: "thunder_rumble.mp3") {
                subBackgroundPlayer = try? AVAudioPlayer(contentsOf: rumbleURL)
                subBackgroundPlayer?.numberOfLoops = -1
                subBackgroundPlayer?.volume = 0.45
                subBackgroundPlayer?.play()
            }
            
            dripTimer = Timer.scheduledTimer(withTimeInterval: 165.0, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.playActualThunder()
                }
            }
            playActualThunder()
            
        } else if soundscape == "산사 목탁과 종소리" {
            if let bellLoopURL = getBundleOrCachedURL(filename: "temple_bell_loop.mp3") {
                backgroundPlayer = try? AVAudioPlayer(contentsOf: bellLoopURL)
                backgroundPlayer?.numberOfLoops = -1
                backgroundPlayer?.volume = 0.40
                backgroundPlayer?.play()
            }
            
            dripTimer = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.playActualWoodblock()
                }
            }
            playActualWoodblock()
            
            windTimer = Timer.scheduledTimer(withTimeInterval: 55.0, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.playActualSubtleBell()
                }
            }
            playActualSubtleBell()
        }
    }
    
    // MARK: - 사운드 중지 및 리소스 완전히 반환
    func stop() {
        dripTimer?.invalidate()
        dripTimer = nil
        
        windTimer?.invalidate()
        windTimer = nil
        
        backgroundPlayer?.stop()
        backgroundPlayer = nil
        
        subBackgroundPlayer?.stop()
        subBackgroundPlayer = nil
        
        thunderPlayer?.stop()
        thunderPlayer = nil
        
        woodblockPlayer?.stop()
        woodblockPlayer = nil
        
        bellPlayer?.stop()
        bellPlayer = nil
        
        tigerRoarPlayer?.stop()
        tigerRoarPlayer = nil
        
        // 합성 엔진 정지 및 리소스 해제
        playerNode?.stop()
        playerNode = nil
        audioEngine?.stop()
        audioEngine = nil
        reverbNode = nil
        eqNode = nil
        
        currentSoundscape = "없음"
    }
    
    // MARK: - 내공 돌파 (1각 / 1식경) 청아하고 맑은 경쇠 소리 & 햅틱 연동 (실시간 반향 원복)
    func playTempleBell() {
        // 햅틱 발동 (진원진기가 뚫리는 묵직한 이중 파동)
        let generator = UIImpactFeedbackGenerator(style: .rigid)
        generator.prepare()
        generator.impactOccurred()
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            let gen2 = UIImpactFeedbackGenerator(style: .medium)
            gen2.impactOccurred()
        }
        
        // 파일 재생 시 뭉개지는 사운드를 막기 위해, 원래의 리버브 잔향 가득한 실시간 합성음 연주로 원복!
        setupAudioEngineIfNeeded()
        guard let engine = audioEngine, let player = playerNode else { return }
        
        if !engine.isRunning {
            try? engine.start()
        }
        
        reverbNode?.wetDryMix = 65 // 청명하고 깊은 명상 잔향 적용
        if let bellBuffer = generateBreakthroughBellBuffer() {
            player.scheduleBuffer(bellBuffer, at: nil, options: [], completionHandler: nil)
            if !player.isPlaying {
                player.play()
            }
        }
    }
    
    // MARK: - 실제 오디오 파일 격발기
    private func playActualTigerRoar() {
        if let url = getBundleOrCachedURL(filename: "tiger_roar.mp3") {
            tigerRoarPlayer = try? AVAudioPlayer(contentsOf: url)
            tigerRoarPlayer?.volume = 0.95
            tigerRoarPlayer?.play()
        }
    }
    
    private func playActualThunder() {
        if let url = getBundleOrCachedURL(filename: "thunder.mp3") {
            thunderPlayer = try? AVAudioPlayer(contentsOf: url)
            thunderPlayer?.volume = 0.95
            thunderPlayer?.play()
        }
    }
    
    private func playActualWoodblock() {
        if let url = getBundleOrCachedURL(filename: "woodblock.mp3") {
            woodblockPlayer = try? AVAudioPlayer(contentsOf: url)
            woodblockPlayer?.volume = 0.90
            woodblockPlayer?.play()
        }
    }
    
    private func playActualSubtleBell() {
        if let url = getBundleOrCachedURL(filename: "temple_bell.mp3") {
            bellPlayer = try? AVAudioPlayer(contentsOf: url)
            bellPlayer?.volume = 0.85
            bellPlayer?.play()
        }
    }
    
    // MARK: - 합성용 서브 함수
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
    
    private func generateBreakthroughBellBuffer() -> AVAudioPCMBuffer? {
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
            
            // 맥놀이(Beating) 동양종 주파수 합성 (기본 주파수 330Hz의 맑은 경쇠음)
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
