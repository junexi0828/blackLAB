import SwiftUI

struct CaveHomeView: View {
    @ObservedObject var store: StudySessionStore
    @ObservedObject var guardManager = FocusGuardManager.shared
    @State private var isPulsing = false
    @State private var rotationAngle: Double = 0.0
    @State private var isShowingTierGuide = false
    @State private var isShowingBeastScroll = false
    @State private var isImmersiveDismissed = false
    @State private var homeParticles: [HomeParticle] = []
    @State private var homeTimer: Timer? = nil
    
    struct HomeParticle: Identifiable {
        let id = UUID()
        var x: CGFloat
        var y: CGFloat
        var size: CGFloat
        var opacity: Double
        var speed: CGFloat
        var rotation: Double = 0.0
        var color: Color = .yellow
    }

    private var isTesting: Bool {
        NSClassFromString("XCTest") != nil
    }

    var body: some View {
        let hasActiveBeast = store.selectedBeast != "없음"
        let isImmersiveActive = store.isRunning && hasActiveBeast && !isImmersiveDismissed
        let activeBeast = wulinBeasts.first(where: { $0.id == store.selectedBeast })
        
        return ZStack {
            caveBackground
            
            // ── 영물 전체 화면 몰입형 시네마틱 세로 꽉 찬 화면 (Immersive Beast Full Portrait Mode) ──
            if isImmersiveActive, let beast = activeBeast {
                GeometryReader { geo in
                    let screenHeight = geo.size.height
                    let screenWidth = geo.size.width
                    
                    ZStack(alignment: .bottom) {
                        // 1. 최하단 레이어: 가로 16:9 영물을 상하좌우 자유롭게 터치 드래그하며 볼 수 있는 스크롤뷰
                        ScrollView([.horizontal, .vertical], showsIndicators: false) {
                            WulinImageView(filename: "\(beast.imageName).png", contentMode: .fit)
                                .frame(height: screenHeight) // 세로 길이를 화면 높이에 맞춤
                                .frame(minWidth: screenWidth) // 가로가 좁아도 최소 화면 폭 이상 보장
                        }
                        .ignoresSafeArea()
                        
                        #if os(iOS)
                        // 2. 중간 시네마틱 이팩트 및 그라데이션 (.allowsHitTesting(false)로 드래그 제스처 방해 차단)
                        Group {
                            Color.black.opacity(0.35)
                            
                            LinearGradient(
                                colors: [.black.opacity(0.65), .clear, .black.opacity(0.85)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            
                            RadialGradient(
                                colors: [beast.color.opacity(0.35), .clear],
                                center: .center,
                                startRadius: 10,
                                endRadius: 280
                            )
                            .blendMode(.screen)
                        }
                        .allowsHitTesting(false)
                        .ignoresSafeArea()
                        #endif
                        
                        // 3. UI 텍스트 오버레이 (.allowsHitTesting(false) 처리로 텍스트 위를 문질러도 스크롤이 작동됨)
                        VStack(spacing: 24) {
                            Spacer()
                            
                            // 초대형 타이머 렌더링
                            Text(store.currentSessionText)
                                .font(.system(size: 96, weight: .black, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(.white)
                                .shadow(color: beast.color.opacity(0.9), radius: 25)
                                .padding(.vertical, 10)
                            
                            Spacer()
                            
                            // 영물이 공부를 강제하는 위엄 넘치는 전통 훈계 문장 한마디
                            VStack(spacing: 12) {
                                Image(systemName: "laurel.leading")
                                    .font(.title3)
                                    .foregroundStyle(CaveTheme.gold)
                                
                                Text(getBeastStudyEnforceQuote(beastId: beast.id))
                                    .font(.system(size: 18, weight: .bold, design: .serif))
                                    .foregroundStyle(.white)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 24)
                                    .shadow(color: .black, radius: 8)
                                    .lineSpacing(6)
                                
                                Image(systemName: "laurel.trailing")
                                    .font(.title3)
                                    .foregroundStyle(CaveTheme.gold)
                            }
                            
                            Spacer()
                            
                            // 신전귀환 버튼 공간용 스페이서
                            Color.clear.frame(height: 70)
                        }
                        .padding(24)
                        .allowsHitTesting(false)
                        
                        // 4. 최상단 터치 레이어: 신전귀환 물리 복귀 버튼 (터치 활성화)
                        Button {
                            withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) {
                                isImmersiveDismissed = true
                            }
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "door.right.hand.closed")
                                    .font(.system(size: 13))
                                Text("神殿歸還 (신전귀환 - 수련실 복귀)")
                            }
                            .font(.system(size: 13, weight: .bold, design: .serif))
                            .foregroundStyle(CaveTheme.gold)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(
                                Capsule()
                                    .fill(Color.black.opacity(0.75))
                                    .overlay(
                                        Capsule()
                                            .strokeBorder(CaveTheme.gold.opacity(0.4), lineWidth: 1)
                                    )
                            )
                        }
                        .padding(.bottom, 24)
                    }
                }
                .transition(.opacity)
                .ignoresSafeArea()
                .zIndex(100) // 최상단 오버레이 (하단 탭 바, 설정 등 싹 다 가림)
            }
            
            // 영물별 전용 로컬 이팩트 오버레이 (신비로운 안개 및 호흡하는 기류 스모그 디자인 개편)
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                ZStack {
                    ForEach(homeParticles) { p in
                        // rotation 변수를 삼각함수 위상 차이로 매핑하여 안개 기류가 숨쉬듯 부드럽게 밝아졌다 약해졌다 호흡함
                        let breathIntensity = 0.4 + 0.6 * sin(p.rotation * 0.04 + p.x * 3.0)
                        let adjustedOpacity = p.opacity * breathIntensity
                        
                        Group {
                            if store.selectedBeast == "imugi" {
                                Ellipse()
                                    .fill(p.color.opacity(adjustedOpacity * 0.8))
                                    .frame(width: p.size * 2.2, height: p.size * 0.85)
                                    .blur(radius: p.size * 0.35)
                            } else if store.selectedBeast == "qilin" {
                                Ellipse()
                                    .fill(p.color.opacity(adjustedOpacity * 0.85))
                                    .frame(width: p.size * 1.8, height: p.size * 0.95)
                                    .blur(radius: p.size * 0.4)
                            } else if store.selectedBeast == "daebung" {
                                Ellipse()
                                    .fill(p.color.opacity(adjustedOpacity * 0.65))
                                    .frame(width: p.size * 2.6, height: p.size * 0.6)
                                    .blur(radius: p.size * 0.3)
                            } else if store.selectedBeast == "white_tiger" {
                                Ellipse()
                                    .fill(p.color.opacity(adjustedOpacity * 0.75))
                                    .frame(width: p.size * 2.4, height: p.size * 0.9)
                                    .blur(radius: p.size * 0.4)
                            } else {
                                Ellipse()
                                    .fill(p.color.opacity(adjustedOpacity * 0.7))
                                    .frame(width: p.size * 2.0, height: p.size * 0.75)
                                    .blur(radius: p.size * 0.35)
                            }
                        }
                        .position(x: p.x * w, y: p.y * h)
                    }
                }
            }
            .ignoresSafeArea()
            .allowsHitTesting(false).ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    titleBlock
                    
                    if guardManager.isMockCameraEnabled {
                        focusGuardStatusBlock
                    }
                    
                    // 수련실 중앙의 원형 타이머 캔버스를 원래대로 상시 노출시킴 (건들지 않음!)
                    giantBeastCanvas
                    giantTimerView
                    
                    if store.selectedBeast == "없음" {
                        descriptionCard
                    }
                    
                    if store.isRunning && hasActiveBeast && isImmersiveDismissed {
                        Button {
                            withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) {
                                isImmersiveDismissed = false
                            }
                        } label: {
                            HStack {
                                Image(systemName: "scroll.fill")
                                Text("靈物共鳴 幻影入境 (영물 몰입 화면 진입)")
                            }
                            .font(.system(size: 14, weight: .black, design: .serif))
                            .foregroundStyle(CaveTheme.gold)
                            .padding(.vertical, 14)
                            .frame(maxWidth: .infinity)
                            .background(
                                ZStack {
                                    Color(white: 0.07)
                                    RoundedRectangle(cornerRadius: 12)
                                        .strokeBorder(CaveTheme.gold.opacity(0.6), lineWidth: 1.5)
                                }
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .shadow(color: .black.opacity(0.6), radius: 6, y: 3)
                        }
                        .padding(.horizontal, 4)
                        .transition(.scale.combined(with: .opacity))
                    }
                    
                    controlBlock
                    
                    // 동반 영물 소환 비급 버튼을 수련 제어 패널(controlBlock) 아래로 재배치!
                    spiritBeastCinematicBanner
                    
                    statsRowBlock
                    recentLogBlock
                    
                    if guardManager.isMockCameraEnabled {
                        FocusGuardDebugView()
                    }
                }
                .padding(20)
            }
        }
.sheet(isPresented: $isShowingTierGuide) {
            ZenTierGuideView()
        }
        .sheet(isPresented: $isShowingBeastScroll) {
            WulinBeastScrollView(store: store)
        }
        .onAppear {
            setupHomeParticles()
            startHomeParticles()
            // 세션 시작 또는 화면 진입 시 상태 리셋
            if !store.isRunning {
                isImmersiveDismissed = false
            }
        }
        .onDisappear {
            homeTimer?.invalidate()
            homeTimer = nil
        }
        .onChange(of: store.selectedBeast) { _ in
            setupHomeParticles()
            startHomeParticles()
        }
        .onChange(of: store.isRunning) { running in
            setupHomeParticles()
            startHomeParticles()
            if running {
                // 수련이 새로 시작될 때 자동으로 다시 전체 몰입 모드 진입
                isImmersiveDismissed = false
            } else {
                isImmersiveDismissed = false
            }
        }
    }

    private var caveBackground: some View {
        LinearGradient(
            colors: [CaveTheme.backgroundTop, CaveTheme.backgroundBottom],
            startPoint: .top,
            endPoint: .bottom
        )
        .overlay {
            RadialGradient(
                colors: [CaveTheme.gold.opacity(0.22), .clear],
                center: .top,
                startRadius: 10,
                endRadius: 280
            )
            .blendMode(.screen)
        }
        .ignoresSafeArea()
    }

    private var titleBlock: some View {
        Button {
            isShowingTierGuide = true
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("폐관수련 (閉關修練)")
                        .font(.system(size: 26, weight: .black, design: .serif))
                        .foregroundStyle(.white)
                    
                    Spacer()
                    
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(CaveTheme.gold.opacity(0.6))
                }
                
                // 실시간 기류 흐름 나레이션
                Text(OrientalTimeFormatter.getOrientalTimeNarrative())
                    .font(.system(size: 11, weight: .bold, design: .serif))
                    .foregroundStyle(CaveTheme.gold.opacity(0.85))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                
                // 실시간 수련 공력 (세션 가동 시에만 고풍스럽게 노출)
                if store.isRunning || store.isPaused {
                    Text("수련 공력 : \(store.currentSessionOrientalText)")
                        .font(.system(size: 13, weight: .black, design: .serif))
                        .foregroundStyle(CaveTheme.ember)
                        .transition(.opacity.combined(with: .scale(scale: 0.95)))
                }
                
                // 수련 경지 배너를 하단에 가로로 길게 배치 (절대 잘리지 않고 일체감을 줌)
                HStack(spacing: 6) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(CaveTheme.ember)
                    Text("현재 경지: \(store.userTierKoreanOnly)")
                        .font(.system(size: 12, weight: .bold, design: .serif))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(CaveTheme.gold.opacity(0.12))
                        .overlay(
                            Capsule()
                                .strokeBorder(CaveTheme.gold.opacity(0.3), lineWidth: 1)
                        )
                )
                .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(CaveTheme.panel.opacity(0.88))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(CaveTheme.gold.opacity(0.24), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
    
    private var giantBeastCanvas: some View {
        let beastImages = ["TigerSpirit", "DragonFocus", "PhoenixFocus", "BambooSpirit", "CaveHermit", "LotusZen"]
        let currentBeast = store.isRunning ? beastImages[Int(store.currentSessionSeconds) / 8 % beastImages.count] : "TigerSpirit"
        
        return VStack(spacing: 16) {
            ZStack {
                // 1. Massive Glowing Aura background
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [CaveTheme.gold.opacity(store.isRunning ? 0.20 : 0.05), .clear],
                            center: .center,
                            startRadius: 20,
                            endRadius: 130
                        )
                    )
                    .frame(width: 260, height: 260)
                    .scaleEffect(isPulsing ? 1.08 : 0.94)
                    .animation(isTesting ? .default : .easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: isPulsing)
                
                // 2. Dual rotating golden runic circles
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [CaveTheme.gold.opacity(0.7), .clear, CaveTheme.ember.opacity(0.5), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        ),
                        style: StrokeStyle(lineWidth: 2.0, lineCap: .round, dash: [6, 16])
                    )
                    .frame(width: 226, height: 226)
                    .rotationEffect(.degrees(rotationAngle))
                    .animation(store.isRunning && !isTesting ? .linear(duration: 15).repeatForever(autoreverses: false) : .default, value: rotationAngle)
                
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [CaveTheme.jade.opacity(0.4), .clear, CaveTheme.gold.opacity(0.3), .clear],
                            startPoint: .bottom,
                            endPoint: .top
                        ),
                        style: StrokeStyle(lineWidth: 1.0, lineCap: .round, dash: [3, 10])
                    )
                    .frame(width: 240, height: 240)
                    .rotationEffect(.degrees(-rotationAngle * 0.7))
                    .animation(store.isRunning && !isTesting ? .linear(duration: 20).repeatForever(autoreverses: false) : .default, value: rotationAngle)
                
                // 3. Central beast art circle
                Image(currentBeast)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 200, height: 200)
                    .clipShape(Circle())
                    .id(currentBeast)
                    .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.92)), removal: .opacity))
                    .animation(.easeInOut(duration: 1.2), value: currentBeast)
                    .overlay(
                        Circle()
                            .strokeBorder(
                                LinearGradient(
                                    colors: [CaveTheme.gold, CaveTheme.gold.opacity(0.3)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 3
                            )
                    )
                    .shadow(color: (store.isRunning ? CaveTheme.gold : Color.black).opacity(0.6), radius: 15)
            }
            .frame(width: 260, height: 260)
            .onAppear {
                isPulsing = true
                if store.isRunning {
                    if isTesting {
                        rotationAngle = 360
                    } else {
                        withAnimation(.linear(duration: 15).repeatForever(autoreverses: false)) {
                            rotationAngle = 360
                        }
                    }
                }
            }
            .onChange(of: store.isRunning) { running in
                if running {
                    if isTesting {
                        rotationAngle = 360
                    } else {
                        withAnimation(.linear(duration: 15).repeatForever(autoreverses: false)) {
                            rotationAngle = 360
                        }
                    }
                } else {
                    withAnimation(.default) {
                        rotationAngle = 0
                    }
                }
            }
            
            // Beast Name Tag
            Text(beastName(for: currentBeast))
                .font(.system(size: 16, weight: .bold, design: .serif))
                .foregroundStyle(CaveTheme.gold)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(Color.white.opacity(0.04))
                        .overlay(Capsule().strokeBorder(CaveTheme.gold.opacity(0.25), lineWidth: 1))
                )
                .shadow(color: CaveTheme.gold.opacity(0.3), radius: 4)
                .id(currentBeast + "_name")
                .transition(.opacity)
                .animation(.easeInOut(duration: 0.8), value: currentBeast)
        }
        .scaleEffect(store.justAchievedCycle ? 1.08 : 1.0)
        .animation(.spring(response: 0.4, dampingFraction: 0.5), value: store.justAchievedCycle)
    }

    private var giantTimerView: some View {
        VStack(spacing: 4) {
            if store.isRunning || store.isPaused {
                Text(store.currentSessionText)
                    .font(.system(size: 56, weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .shadow(color: store.justAchievedCycle ? CaveTheme.ember : CaveTheme.gold.opacity(0.8), radius: store.justAchievedCycle ? 28 : 15)
                    .scaleEffect(store.justAchievedCycle ? 1.15 : 1.0)
                    .animation(.spring(response: 0.4, dampingFraction: 0.5), value: store.justAchievedCycle)
                    .transition(.scale.combined(with: .opacity))
            } else {
                Text("00:00:00")
                    .font(.system(size: 42, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.3))
            }
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.7), value: store.isRunning || store.isPaused)
    }

    private var descriptionCard: some View {
        let beastImages = ["TigerSpirit", "DragonFocus", "PhoenixFocus", "BambooSpirit", "CaveHermit", "LotusZen"]
        let currentBeast = store.isRunning ? beastImages[Int(store.currentSessionSeconds) / 8 % beastImages.count] : "TigerSpirit"
        
        return Text(beastDescription(for: currentBeast))
            .font(.system(size: 15, weight: .medium, design: .serif))
            .foregroundStyle(store.isRunning ? CaveTheme.gold.opacity(0.9) : .white.opacity(0.68))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(Color.white.opacity(0.05), lineWidth: 1)
                    )
            )
            .id(currentBeast + "_card_desc")
            .transition(.opacity)
            .animation(.easeInOut(duration: 0.8), value: currentBeast)
    }

    private var statsRowBlock: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("총 수련")
                    .font(.system(size: 13, weight: .semibold, design: .serif))
                    .foregroundStyle(CaveTheme.gold.opacity(0.8))
                Text(store.totalStudyText)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .background(stonePanel)
            
            VStack(alignment: .leading, spacing: 6) {
                Text("오늘 수련")
                    .font(.system(size: 13, weight: .semibold, design: .serif))
                    .foregroundStyle(CaveTheme.ember.opacity(0.85))
                Text(store.todayStudyText)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .background(stonePanel)
        }
    }

    private var controlBlock: some View {
        VStack(spacing: 14) {
            if store.isRunning {
                // 수련 중 상태: 일시 중지 + 수련 완료 (하산)
                HStack(spacing: 12) {
                    Button {
                        store.pauseSession()
                    } label: {
                        Text("수련 대기 (Pause)")
                            .font(.system(size: 16, weight: .bold, design: .serif))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .foregroundStyle(.white)
                            .background(Color.white.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .strokeBorder(CaveTheme.gold.opacity(0.35), lineWidth: 1)
                            )
                    }
                    
                    Button {
                        store.stopSession()
                    } label: {
                        Text("수련 완료 (하산)")
                            .font(.system(size: 16, weight: .bold, design: .serif))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .foregroundStyle(.white)
                            .background(CaveTheme.ember)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
            } else if store.isPaused {
                // 일시 중지 상태: 수련 재개 + 수련 완료 (하산)
                HStack(spacing: 12) {
                    Button {
                        store.resumeSession()
                    } label: {
                        Text("수련 재개 (Resume)")
                            .font(.system(size: 16, weight: .bold, design: .serif))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .foregroundStyle(.black)
                            .background(CaveTheme.gold)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    
                    Button {
                        store.stopSession()
                    } label: {
                        Text("수련 완료 (하산)")
                            .font(.system(size: 16, weight: .bold, design: .serif))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .foregroundStyle(.white)
                            .background(CaveTheme.ember)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                }
            } else {
                // 대기 중: 입관 시작 단독
                Button {
                    store.startSession()
                } label: {
                    Text("입관 시작 (入關)")
                        .font(.system(size: 20, weight: .bold, design: .serif))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .foregroundStyle(.black)
                        .background(CaveTheme.gold)
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .accessibilityIdentifier("startSessionButton")
            }

            // 하단 상태 표시줄
            Text(store.isRunning ? "정진 중 (精進)" : (store.isPaused ? "수련 대기 (靜止)" : "입관 대기 (閉關)"))
                .font(.system(size: 14, weight: .semibold, design: .serif))
                .foregroundStyle(store.isRunning ? CaveTheme.gold : (store.isPaused ? CaveTheme.ember : .white.opacity(0.5)))
        }
        .padding(20)
        .background(stonePanel)
    }

    private var recentLogBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("수련 장부")
                .font(.system(size: 18, weight: .bold, design: .serif))
                .foregroundStyle(.white)

            if store.recentEntries.isEmpty {
                Text("아직 기록이 없다. 첫 수련을 남기면 여기서 축적이 보인다.")
                    .font(.system(size: 15, weight: .medium, design: .serif))
                    .foregroundStyle(.white.opacity(0.68))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(spacing: 10) {
                    ForEach(store.recentEntries) { entry in
                        HStack {
                            Text(Self.entryDateFormatter.string(from: entry.date))
                            Spacer()
                            Text(CaveTimeFormatter.format(seconds: entry.duration))
                        }
                        .font(.system(size: 15, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.88))
                        .padding(.vertical, 4)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(stonePanel)
    }

    private var focusGuardStatusBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("집중 감시")
                    .font(.system(size: 15, weight: .semibold, design: .serif))
                    .foregroundStyle(CaveTheme.gold.opacity(0.9))
                Spacer()
                
                // Show warning or failure status
                if guardManager.state == .warning {
                    Text("경고")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("guardStateTitle")
                } else if guardManager.state == .failed {
                    Text("실패")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("resultTitle")
                } else {
                    Text("정상")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(.green)
                }
            }
            
            if guardManager.state == .normal {
                Text("집중 상태가 정상입니다.")
                    .font(.system(size: 15, weight: .medium, design: .serif))
                    .foregroundStyle(.white.opacity(0.85))
                    .accessibilityIdentifier("sessionSummaryText")
            } else if guardManager.state == .warning {
                Text("집중이 감지되지 않습니다. 화면을 주시하십시오.")
                    .font(.system(size: 15, weight: .medium, design: .serif))
                    .foregroundStyle(.orange)
            } else if guardManager.state == .failed {
                Text("집중 상태가 오랫동안 이탈하여 실패로 기록되었습니다.")
                    .font(.system(size: 15, weight: .medium, design: .serif))
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(stonePanel)
    }

    private var stonePanel: some View {
        RoundedRectangle(cornerRadius: 26, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [CaveTheme.panel.opacity(0.9), CaveTheme.panelSoft.opacity(0.95)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .strokeBorder(.white.opacity(0.06), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.25), radius: 18, x: 0, y: 12)
    }

    private static let entryDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MM/dd HH:mm"
        return formatter
    }()
    
    private func beastDescription(for imageName: String) -> String {
        switch imageName {
        case "TigerSpirit":
            return "백호의 영혼이 동굴 입구를 굳건히 수호합니다"
        case "DragonFocus":
            return "청룡의 기운이 마음을 깨우고 집중을 인도합니다"
        case "PhoenixFocus":
            return "봉황의 불씨가 흩어진 정신을 한데 모읍니다"
        case "BambooSpirit":
            return "곧은 대나무의 절개가 잡념을 물리치고 정진케 합니다"
        case "CaveHermit":
            return "신선이 삼라만상을 조율하듯 명상의 균형을 잡습니다"
        case "LotusZen":
            return "맑은 연꽃이 수렁 속에서 피어나 평안을 깃들입니다"
        default:
            return "호랑이가 동굴 앞을 수호합니다"
        }
    }
    
    private func beastName(for imageName: String) -> String {
        switch imageName {
        case "TigerSpirit": return "백호 수호 (白虎)"
        case "DragonFocus": return "청룡 정진 (靑龍)"
        case "PhoenixFocus": return "봉황 정련 (鳳凰)"
        case "BambooSpirit": return "죽림 지조 (竹林)"
        case "CaveHermit": return "신선 묵상 (神仙)"
        case "LotusZen": return "연화 평정 (蓮花)"
        default: return "수호 야수"
        }
    }
}

// MARK: - 무협 수련 경지 기준표 커스텀 팝업 뷰
struct ZenTierGuideView: View {
    @Environment(\.dismiss) private var dismiss
    
    struct TierItem: Identifiable {
        let id = UUID()
        let name: String
        let condition: String
        let desc: String
        let color: Color
    }
    
    let tiers = [
        TierItem(name: "생사경 (生死境)", condition: "1000시간 이상", desc: "생사를 초월해 삼라만상과 일체를 이루는 전설", color: Color(red: 0.85, green: 0.2, blue: 0.2)),
        TierItem(name: "현경 (玄境)", condition: "500시간 이상", desc: "인간의 껍질을 벗고 신선(神仙)의 격에 다다른 고수", color: CaveTheme.ember),
        TierItem(name: "화경 (化境)", condition: "250시간 이상", desc: "반로환동을 이루고 기(氣)를 지배하는 경지", color: CaveTheme.gold),
        TierItem(name: "초절정 고수 (超絶頂)", condition: "120시간 이상", desc: "장문인이나 강호 일파의 사조에 해당하는 무인", color: CaveTheme.jade),
        TierItem(name: "절정 고수 (絶頂)", condition: "50시간 이상", desc: "검기를 뿜어내며 중원을 호령하는 거목", color: CaveTheme.gold.opacity(0.85)),
        TierItem(name: "일류 고수 (一流)", condition: "15시간 이상", desc: "강호에서 당당히 한 손을 꼽히는 뛰어난 무사", color: .white.opacity(0.9)),
        TierItem(name: "이류 고수 (二流)", condition: "5시간 이상", desc: "내공을 심장에 축적해 가기 시작한 자", color: .white.opacity(0.65)),
        TierItem(name: "삼류 무사 (三流)", condition: "1시간 이상", desc: "외문 초식을 다듬고 주먹을 쥐기 시작한 무인", color: .white.opacity(0.45)),
        TierItem(name: "입문자 (入門者)", condition: "1시간 미만", desc: "폐관동굴에 갓 발을 들이밀어 가부좌를 튼 초심자", color: .white.opacity(0.3))
    ]
    
    var body: some View {
        ZStack {
            // 동양 무협 어두운 분위기
            LinearGradient(
                colors: [Color(red: 0.08, green: 0.08, blue: 0.09), Color(red: 0.04, green: 0.04, blue: 0.04)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            VStack(spacing: 20) {
                // 상단 헤더
                VStack(spacing: 6) {
                    Text("수련境界表 (수련 경지표)")
                        .font(.system(size: 20, weight: .black, design: .serif))
                        .foregroundStyle(CaveTheme.gold)
                        .tracking(1)
                    Text("폐관동굴에서 벼려낸 내력이 그대의 경지를 증명하리라.")
                        .font(.system(size: 11, weight: .bold, design: .serif))
                        .foregroundStyle(.white.opacity(0.45))
                }
                .padding(.top, 24)
                
                // 경지 리스트
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(tiers) { tier in
                            HStack(spacing: 12) {
                                Circle()
                                    .fill(tier.color)
                                    .frame(width: 8, height: 8)
                                    .shadow(color: tier.color.opacity(0.6), radius: 4)
                                
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(tier.name)
                                        .font(.system(size: 14, weight: .bold, design: .serif))
                                        .foregroundStyle(tier.color)
                                    Text(tier.desc)
                                        .font(.system(size: 11, weight: .medium, design: .serif))
                                        .foregroundStyle(.white.opacity(0.5))
                                        .lineLimit(2)
                                }
                                
                                Spacer()
                                
                                Text(tier.condition)
                                    .font(.system(size: 11, weight: .bold, design: .serif))
                                    .foregroundStyle(CaveTheme.gold.opacity(0.85))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(
                                        RoundedRectangle(cornerRadius: 6)
                                            .fill(CaveTheme.gold.opacity(0.08))
                                    )
                            }
                            .padding(.vertical, 10)
                            .padding(.horizontal, 14)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(Color.white.opacity(0.02))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                                            .strokeBorder(Color.white.opacity(0.03), lineWidth: 1)
                                    )
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                }
                
                // 하단 닫기 도장 버튼
                Button {
                    dismiss()
                } label: {
                    Text("하산 (닫기)")
                        .font(.system(size: 15, weight: .bold, design: .serif))
                        .foregroundStyle(.white)
                        .padding(.vertical, 14)
                        .frame(maxWidth: .infinity)
                        .background(
                            LinearGradient(
                                colors: [Color(red: 0.55, green: 0.12, blue: 0.12), Color(red: 0.35, green: 0.08, blue: 0.08)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .strokeBorder(CaveTheme.gold.opacity(0.4), lineWidth: 1)
                        )
                        .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }
}


// MARK: - 고대 영물 데이터 구조체 및 모델 정의
struct WulinBeast: Identifiable {
    let id: String
    let name: String
    let imageName: String
    let description: String
    let buffTitle: String
    let buffDesc: String
    let color: Color
    let particlesType: String
}

let wulinBeasts = [
    WulinBeast(
        id: "imugi",
        name: "이무기 (Imugi)",
        imageName: "wulin_beast_imugi",
        description: "심연에서 솟아오르는 검은 흑뢰를 품은 가장 강력하고 위압적인 영물입니다.",
        buffTitle: "흑뢰의 기운",
        buffDesc: "집중 성공 시 공력(진기) 획득량 20% 증가",
        color: Color(red: 0.2, green: 0.85, blue: 1.0),
        particlesType: "뇌전"
    ),
    WulinBeast(
        id: "dragon",
        name: "영룡 (Dragon)",
        imageName: "wulin_beast_dragon",
        description: "황금빛 구름 사이를 누비며 하늘을 다스리는 신성하고 고귀한 수호룡입니다.",
        buffTitle: "천룡의 가호",
        buffDesc: "집중 취소 시 소진되는 공력 패널티 50% 방어",
        color: CaveTheme.gold,
        particlesType: "황금진기"
    ),
    WulinBeast(
        id: "qilin",
        name: "화기린 (Fire Qilin)",
        imageName: "wulin_beast_qilin",
        description: "타오르는 불길에 휩싸인 붉은 영물로, 파괴적이면서도 영적인 화염의 힘을 상징합니다.",
        buffTitle: "화기린의 투지",
        buffDesc: "정진 타이머 마감 후 추가 시간(Overtime) 집중 시 공력 2배 획득",
        color: Color(red: 1.0, green: 0.3, blue: 0.1),
        particlesType: "불꽃"
    ),
    WulinBeast(
        id: "daebung",
        name: "대붕 (Giant Bird)",
        imageName: "wulin_beast_daebung",
        description: "북해의 혹한 속에서 얼음 깃털을 휘날리며 절대적인 빙결의 기운을 뿜어내는 거대 새입니다.",
        buffTitle: "만년빙극안",
        buffDesc: "집중 방해 감지 경고 발생 시 공력 차감 차단 1회 방어",
        color: Color(red: 0.6, green: 0.9, blue: 1.0),
        particlesType: "빙결"
    ),
    WulinBeast(
        id: "yonggui",
        name: "용귀 (Dragon Turtle)",
        imageName: "wulin_beast_yonggui",
        description: "뇌전과 파도를 다스리며 고대 룬이 새겨진 등껍질을 가진 거대 영물입니다.",
        buffTitle: "고대 영구의 지혜",
        buffDesc: "영물 소환 상태에서 영약 구매 시 가격 15% 영구 할인",
        color: Color(red: 0.1, green: 0.7, blue: 0.5),
        particlesType: "고대파도"
    ),
    WulinBeast(
        id: "white_tiger",
        name: "백호 (White Tiger)",
        imageName: "wulin_beast_white_tiger",
        description: "폭풍과 바람의 기운을 다스리며 푸른 안광을 띠는 하얀 호랑이 수호신입니다.",
        buffTitle: "백호의 포효",
        buffDesc: "비무(sparring) 진행 시 성공 확률 10% 추가 보정",
        color: Color(red: 0.9, green: 0.9, blue: 0.95),
        particlesType: "폭풍우"
    )
]

// MARK: - 영물보감 (Summoning Scroll) 뷰 정의
struct WulinBeastScrollView: View {
    @ObservedObject var store: StudySessionStore
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            LinearGradient(
                colors: [Color(red: 0.15, green: 0.12, blue: 0.1), Color(white: 0.05)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // 헤더 영역
                HStack {
                    Text("靈物寶鑑 (영물보감)")
                        .font(.system(size: 24, weight: .black, design: .serif))
                        .foregroundStyle(CaveTheme.gold)
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white.opacity(0.6))
                    }
                }
                .padding()
                .background(Color.white.opacity(0.02))
                
                ScrollView {
                    VStack(spacing: 24) {
                        Text("수련에 동반할 전설 속의 영물을 소환하시오. 영물의 특성에 따라 진기가 공명하여 고유의 버프 혜택을 선사하리라.")
                            .font(.system(size: 13, weight: .medium, design: .serif))
                            .foregroundStyle(.white.opacity(0.55))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        
                        ForEach(wulinBeasts) { beast in
                            VStack(spacing: 0) {
                                // 16:9 와이드 시네마틱 프레임
                                ZStack(alignment: .bottomLeading) {
                                    WulinImageView(
                                        filename: "\(beast.imageName).png",
                                        contentMode: .fill
                                    )
                                    .frame(height: 180)
                                    .clipped()
                                    
                                    LinearGradient(
                                        colors: [.clear, .black.opacity(0.85)],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    )
                                    
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(beast.buffTitle)
                                            .font(.system(size: 11, weight: .bold, design: .serif))
                                            .foregroundStyle(.black)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 3)
                                            .background(beast.color)
                                            .clipShape(Capsule())
                                        
                                        Text(beast.name)
                                            .font(.system(size: 18, weight: .black, design: .serif))
                                            .foregroundStyle(.white)
                                    }
                                    .padding(14)
                                }
                                .frame(height: 180)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 0)
                                        .strokeBorder(CaveTheme.gold.opacity(0.35), lineWidth: 1.5)
                                )
                                
                                // 정보 및 수련 선택
                                VStack(alignment: .leading, spacing: 12) {
                                    Text(beast.description)
                                        .font(.system(size: 13, weight: .medium, design: .serif))
                                        .foregroundStyle(.white.opacity(0.75))
                                        .lineSpacing(4)
                                    
                                    Divider()
                                        .background(Color.white.opacity(0.08))
                                    
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("진기 공명 혜택")
                                                .font(.system(size: 11, weight: .bold, design: .serif))
                                                .foregroundStyle(CaveTheme.gold)
                                            Text(beast.buffDesc)
                                                .font(.system(size: 12, weight: .bold, design: .serif))
                                                .foregroundStyle(.white)
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                        Spacer(minLength: 16)
                                        
                                        let isSelected = store.selectedBeast == beast.id
                                        
                                        Button {
                                            store.selectedBeast = isSelected ? "없음" : beast.id
                                            dismiss()
                                        } label: {
                                            Text(isSelected ? "소환 해제" : "소환하기")
                                                .font(.system(size: 13, weight: .bold, design: .serif))
                                                .foregroundStyle(isSelected ? .white : .black)
                                                .padding(.horizontal, 16)
                                                .padding(.vertical, 8)
                                                .background(isSelected ? Color.white.opacity(0.12) : CaveTheme.gold)
                                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                                        .strokeBorder(isSelected ? CaveTheme.gold.opacity(0.5) : Color.clear, lineWidth: 1)
                                                )
                                        }
                                    }
                                }
                                .padding(16)
                                .background(CaveTheme.panel.opacity(0.9))
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .strokeBorder(CaveTheme.gold.opacity(0.24), lineWidth: 1)
                            )
                            .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
                            .padding(.horizontal)
                        }
                    }
                    .padding(.vertical)
                }
            }
        }
    }
}

// MARK: - 영물 소환 로직 및 파티클 연동 익스텐션
extension CaveHomeView {
    
    // 영물별 전통 훈계 문장 (공부 강제 매치)
    private func getBeastStudyEnforceQuote(beastId: String) -> String {
        switch beastId {
        case "imugi":
            return "심연의 흑뢰가 너를 지켜보느니, 나태함은 곧 파멸이다."
        case "dragon":
            return "황금빛 구룡이 지켜보거늘, 어찌 일순간의 망상에 정신을 빼앗기는가?"
        case "qilin":
            return "단전의 불꽃이 사그라지기 전에, 네 온 정신을 무도에 집중하라."
        case "daebung":
            return "혹한의 빙설은 찰나의 흔들림도 용납지 않는다. 마음을 얼려 집중하라."
        case "yonggui":
            return "대지처럼 묵직하게 앉아 정진하라. 내 등껍질처럼 견고한 중심을 잡으라."
        case "white_tiger":
            return "백호의 푸른 기운이 번뜩이나니, 일체의 잡념을 베어버려라."
        default:
            return "한 순간의 나태가 평생의 내공을 허사로 만드느니라."
        }
    }
    
    // 영물 소환 배너 및 시네마틱 카드
    var spiritBeastCinematicBanner: some View {
        let currentBeastId = store.selectedBeast
        let beast = wulinBeasts.first(where: { $0.id == currentBeastId })
        
        return VStack(spacing: 12) {
            if let beast = beast {
                VStack(spacing: 0) {
                    ZStack(alignment: .bottomLeading) {
                        WulinImageView(
                            filename: "\(beast.imageName).png",
                            contentMode: .fill
                        )
                        .frame(height: 180)
                        .clipped()
                        
                        LinearGradient(
                            colors: [.clear, .black.opacity(0.8)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        
                        RadialGradient(
                            colors: [beast.color.opacity(0.35), .clear],
                            center: .center,
                            startRadius: 20,
                            endRadius: 150
                        )
                        .blendMode(.screen)
                        
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Image(systemName: "sparkles")
                                    .font(.caption)
                                    .foregroundStyle(.black)
                                Text("소환 완료 (召喚)")
                                    .font(.system(size: 10, weight: .bold, design: .serif))
                                    .foregroundStyle(.black)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(beast.color)
                            .clipShape(Capsule())
                            
                            Text(beast.name)
                                .font(.system(size: 20, weight: .black, design: .serif))
                                .foregroundStyle(.white)
                                .shadow(color: .black, radius: 4)
                        }
                        .padding(14)
                    }
                    .frame(height: 180)
                    .overlay(
                        RoundedRectangle(cornerRadius: 0)
                            .strokeBorder(CaveTheme.gold.opacity(0.4), lineWidth: 1.5)
                    )
                    
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("공명 영능 버프")
                                .font(.system(size: 11, weight: .bold, design: .serif))
                                .foregroundStyle(CaveTheme.gold)
                            Text(beast.buffDesc)
                                .font(.system(size: 12, weight: .bold, design: .serif))
                                .foregroundStyle(.white)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 12)
                        
                        Button {
                            isShowingBeastScroll = true
                        } label: {
                            Text("영물 변경")
                                .font(.system(size: 12, weight: .bold, design: .serif))
                                .foregroundStyle(.black)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(CaveTheme.gold)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(CaveTheme.panel.opacity(0.92))
                }
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(CaveTheme.gold.opacity(0.24), lineWidth: 1)
                )
                .shadow(color: beast.color.opacity(0.15), radius: 10)
            } else {
                Button {
                    isShowingBeastScroll = true
                } label: {
                    HStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(CaveTheme.gold.opacity(0.08))
                                .frame(width: 50, height: 50)
                                .overlay(
                                    Circle()
                                        .strokeBorder(CaveTheme.gold.opacity(0.25), lineWidth: 1)
                                )
                            
                            Image(systemName: "sparkles")
                                .font(.title3)
                                .foregroundStyle(CaveTheme.gold)
                        }
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("동반 영물 소환 (靈物召喚)")
                                .font(.system(size: 16, weight: .bold, design: .serif))
                                .foregroundStyle(CaveTheme.gold)
                            
                            Text("전설 속의 수호 영물을 수련에 동반시키시오.")
                                .font(.system(size: 12, weight: .medium, design: .serif))
                                .foregroundStyle(.white.opacity(0.5))
                        }
                        
                        Spacer()
                        
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(CaveTheme.gold.opacity(0.7))
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(CaveTheme.panel.opacity(0.85))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .strokeBorder(CaveTheme.gold.opacity(0.24), lineWidth: 1)
                    )
                }
            }
        }
    }
    
    // 영물별 전용 로컬 이팩트 오버레이 초기화
    func setupHomeParticles() {
        let beastId = store.selectedBeast
        guard beastId != "없음" else {
            homeParticles = []
            return
        }
        
        var particles: [HomeParticle] = []
        let color: Color
        let speedRange: ClosedRange<CGFloat>
        let sizeRange: ClosedRange<CGFloat>
        
        switch beastId {
        case "imugi":
            color = Color(red: 0.15, green: 0.6, blue: 0.95) // 신비로운 검푸른 흑뢰 진기
            speedRange = 0.0006...0.0016
            sizeRange = 160...280 // 거대한 가로 안개 안착
        case "qilin":
            color = Bool.random() ? Color(red: 0.95, green: 0.35, blue: 0.05) : Color(red: 0.9, green: 0.15, blue: 0.0)
            speedRange = 0.0005...0.0015
            sizeRange = 150...260
        case "daebung":
            color = Color(red: 0.75, green: 0.92, blue: 1.0)
            speedRange = 0.0004...0.0012
            sizeRange = 180...320
        case "dragon":
            color = CaveTheme.gold
            speedRange = 0.0003...0.0010
            sizeRange = 200...350 // 황금빛으로 가득 찬 진기 스모그
        case "white_tiger":
            color = Color(white: 0.9)
            speedRange = 0.0005...0.0014
            sizeRange = 220...380
        case "yonggui":
            color = Color(red: 0.12, green: 0.58, blue: 0.4)
            speedRange = 0.0006...0.0016
            sizeRange = 150...270
        default:
            color = CaveTheme.gold
            speedRange = 0.0005...0.0015
            sizeRange = 150...260
        }
        
        for _ in 0..<14 { // 파티클 개수를 14개로 최적화하여 겹겹의 안개가 포개어져 발열 zero 보장
            particles.append(
                HomeParticle(
                    x: CGFloat.random(in: -0.1...1.1),
                    y: CGFloat.random(in: -0.1...1.1),
                    size: CGFloat.random(in: sizeRange),
                    opacity: Double.random(in: 0.04...0.12), // 안개 질감을 위해 투명도를 극도로 낮춤 (0.04~0.12)
                    speed: CGFloat.random(in: speedRange),
                    rotation: Double.random(in: 0...360),
                    color: color
                )
            )
        }
        homeParticles = particles
    }
    
    func startHomeParticles() {
        homeTimer?.invalidate()
        // 프레임 업데이트 타이밍을 0.08초로 조율하여 CPU 소모 극소화
        homeTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { _ in
            Task { @MainActor in
                guard store.isRunning && store.selectedBeast != "없음" else { return }
                let beastId = store.selectedBeast
                
                for i in 0..<homeParticles.count {
                    if i < homeParticles.count {
                        // rotation 값을 프레임마다 증가시켜 숨쉬는 불빛/안개 애니메이션 페이즈 전환
                        homeParticles[i].rotation += 1.2
                        
                        switch beastId {
                        case "daebung":
                            homeParticles[i].y += homeParticles[i].speed
                            homeParticles[i].x += sin(homeParticles[i].y * 2.0) * 0.0006 // 부드럽고 잔잔한 좌우 흔들림
                            if homeParticles[i].y > 1.2 {
                                homeParticles[i].y = -0.2
                                homeParticles[i].x = CGFloat.random(in: -0.1...1.1)
                            }
                        case "imugi":
                            // 이무기 검푸른 안개의 불규칙 이동 감속
                            homeParticles[i].y += homeParticles[i].speed
                            homeParticles[i].x += cos(homeParticles[i].y * 3.0) * 0.0005
                            if homeParticles[i].y > 1.2 {
                                homeParticles[i].y = -0.2
                                homeParticles[i].x = CGFloat.random(in: -0.1...1.1)
                            }
                        case "white_tiger":
                            homeParticles[i].x += homeParticles[i].speed * 0.8
                            homeParticles[i].y += sin(homeParticles[i].x * 4.0) * 0.0003
                            if homeParticles[i].x > 1.2 {
                                homeParticles[i].x = -0.2
                                homeParticles[i].y = CGFloat.random(in: -0.1...1.1)
                            }
                        default:
                            // 상승하는 은은한 연기/안개
                            homeParticles[i].y -= homeParticles[i].speed
                            homeParticles[i].x += CGFloat.random(in: -0.0005...0.0005)
                            if homeParticles[i].y < -0.2 {
                                homeParticles[i].y = 1.2
                                homeParticles[i].x = CGFloat.random(in: -0.1...1.1)
                            }
                        }
                    }
                }
            }
        }
    }
}
