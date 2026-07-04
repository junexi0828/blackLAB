import SwiftUI

struct CaveHomeView: View {
    @ObservedObject var store: StudySessionStore
    @ObservedObject var guardManager = FocusGuardManager.shared
    @State private var isPulsing = false
    @State private var rotationAngle: Double = 0.0
    @State private var isShowingTierGuide = false

    private var isTesting: Bool {
        NSClassFromString("XCTest") != nil
    }

    var body: some View {
        ZStack {
            caveBackground

            ScrollView {
                VStack(spacing: 24) {
                    titleBlock
                    
                    if guardManager.isMockCameraEnabled {
                        focusGuardStatusBlock
                    }
                    
                    giantBeastCanvas
                    giantTimerView
                    descriptionCard
                    controlBlock
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
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 6) {
                Text("폐관수련 (閉關修練)")
                    .font(.system(size: 26, weight: .black, design: .serif))
                    .foregroundStyle(.white)
                
                // 실시간 기류 흐름 나레이션
                Text(OrientalTimeFormatter.getOrientalTimeNarrative())
                    .font(.system(size: 11, weight: .bold, design: .serif))
                    .foregroundStyle(CaveTheme.gold.opacity(0.85))
                    .lineLimit(2)
                
                // 실시간 수련 공력 (세션 가동 시에만 고풍스럽게 노출)
                if store.isRunning || store.isPaused {
                    Text("수련 공력 : \(store.currentSessionOrientalText)")
                        .font(.system(size: 13, weight: .black, design: .serif))
                        .foregroundStyle(CaveTheme.ember)
                        .padding(.top, 2)
                        .transition(.opacity.combined(with: .scale(scale: 0.95)))
                }
            }
            Spacer()
            
            // Dynamic Tier Badge (버튼식 팝업 호출)
            Button {
                isShowingTierGuide = true
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(CaveTheme.ember)
                    Text(store.userTierKoreanOnly)
                        .font(.system(size: 11, weight: .bold, design: .serif))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(CaveTheme.gold.opacity(0.15))
                                .overlay(
                                    Capsule()
                                        .strokeBorder(CaveTheme.gold.opacity(0.35), lineWidth: 1)
                                )
                        )
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(CaveTheme.panel.opacity(0.88))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(CaveTheme.gold.opacity(0.24), lineWidth: 1)
        )
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
    }

    private var giantTimerView: some View {
        VStack(spacing: 4) {
            if store.isRunning || store.isPaused {
                Text(store.currentSessionText)
                    .font(.system(size: 56, weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .shadow(color: CaveTheme.gold.opacity(0.8), radius: 15)
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
