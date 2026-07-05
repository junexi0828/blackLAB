import SwiftUI

struct CaveHistoryView: View {
    @ObservedObject var store: StudySessionStore

    // ── 달 이동 상태 ──
    @State private var currentCalendarMonth: Date = Date()
    // ── 날짜 탭 → 상세 팝업 ──
    @State private var selectedDate: Date? = nil
    @State private var isShowingDayDetail: Bool = false

    // 날짜 키 포맷 (sessionNotes 키와 일치)
    private static let notesKeyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private func noteKey(for date: Date) -> String {
        Self.notesKeyFormatter.string(from: date)
    }

    var body: some View {
        ZStack {
            caveBackground

            ScrollView {
                VStack(spacing: 20) {
                    headerBlock
                    statsGrid
                    zenCalendarBlock
                    ledgerBlock
                }
                .padding(20)
            }
        }
        .sheet(isPresented: $isShowingDayDetail) {
            DayDetailSheet(store: store, date: selectedDate ?? Date())
        }
    }

    private var caveBackground: some View {
        LinearGradient(
            colors: [CaveTheme.backgroundTop, CaveTheme.backgroundBottom],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private var headerBlock: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 6) {
                Text("수련 장부")
                    .font(.system(size: 32, weight: .black, design: .serif))
                    .foregroundStyle(.white)
                Text("지금껏 걸어온 정진의 흔적입니다.")
                    .font(.system(size: 14, weight: .medium, design: .serif))
                    .foregroundStyle(.white.opacity(0.64))
            }
            Spacer()

            Image("BambooSpirit")
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(CaveTheme.gold.opacity(0.25), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: 6)
        }
        .padding(.vertical, 10)
    }

    private var statsGrid: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                statCard(title: "총 수련 회차", value: "\(store.totalSessionsCount)회", icon: "pencil.and.outline", accent: CaveTheme.gold)
                statCard(title: "연속 수련일", value: "\(store.streakDays)일", icon: "flame.fill", accent: CaveTheme.ember)
            }

            HStack(spacing: 12) {
                statCard(title: "평균 수련 시간", value: store.averageSessionDurationText, icon: "hourglass", accent: CaveTheme.jade)
                statCard(title: "수련 등급", value: store.userTierKoreanOnly, icon: "laurel.leading", accent: CaveTheme.gold)
            }
        }
    }

    private func statCard(title: String, value: String, icon: String, accent: Color) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(accent)
                Spacer()
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold, design: .serif))
                    .foregroundStyle(.white.opacity(0.55))
                Text(value)
                    .font(.system(size: 18, weight: .bold, design: .serif))
                    .foregroundStyle(.white)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
            }
        }
        .padding(16)
        .background(stonePanel)
    }

    private var ledgerBlock: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("수련 일지")
                    .font(.system(size: 18, weight: .bold, design: .serif))
                    .foregroundStyle(CaveTheme.gold)
                Spacer()
                Text("총 \(store.sessionLog.count)개 기록")
                    .font(.system(size: 13, weight: .semibold, design: .serif))
                    .foregroundStyle(.white.opacity(0.5))
            }
            .padding(.horizontal, 4)

            if store.sessionLog.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "tray")
                        .font(.system(size: 32))
                        .foregroundStyle(.white.opacity(0.2))
                    Text("장부가 비어 있습니다. 첫 입관을 마쳐 흔적을 남기십시오.")
                        .font(.system(size: 14, weight: .medium, design: .serif))
                        .foregroundStyle(.white.opacity(0.4))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60)
                .background(stonePanel)
            } else {
                VStack(spacing: 12) {
                    ForEach(store.sessionLog) { entry in
                        HStack(spacing: 16) {
                            Circle()
                                .fill(CaveTheme.gold.opacity(0.6))
                                .frame(width: 8, height: 8)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(Self.logDateFormatter.string(from: entry.date))
                                    .font(.system(size: 15, weight: .semibold, design: .serif))
                                    .foregroundStyle(.white)
                                
                                HStack(spacing: 6) {
                                    Text(Self.logTimeFormatter.string(from: entry.date))
                                        .font(.system(size: 12))
                                        .foregroundStyle(.white.opacity(0.45))
                                    
                                    if let memo = entry.memo, !memo.isEmpty {
                                        Text("•")
                                            .font(.system(size: 10))
                                            .foregroundStyle(.white.opacity(0.3))
                                        Text(memo)
                                            .font(.system(size: 12, design: .serif))
                                            .foregroundStyle(CaveTheme.gold.opacity(0.85))
                                            .lineLimit(1)
                                    }
                                }
                            }

                            Spacer()

                            HStack(spacing: 12) {
                                Text(CaveTimeFormatter.format(seconds: entry.duration))
                                    .font(.system(size: 16, weight: .bold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(CaveTheme.jade)

                                Button {
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                        store.deleteEntry(id: entry.id)
                                    }
                                } label: {
                                    Image(systemName: "trash.fill")
                                        .font(.system(size: 12))
                                        .foregroundStyle(.red.opacity(0.7))
                                        .padding(8)
                                        .background(Color.red.opacity(0.1))
                                        .clipShape(Circle())
                                }
                                .accessibilityIdentifier("deleteEntryButton_\(entry.id.uuidString)")
                            }
                        }
                        .padding(.vertical, 12)
                        .padding(.horizontal, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(Color.white.opacity(0.02))
                        )
                    }
                }
                .padding(8)
                .background(stonePanel)
            }
        }
    }

    private var stonePanel: some View {
        RoundedRectangle(cornerRadius: 24, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [CaveTheme.panel.opacity(0.85), CaveTheme.panelSoft.opacity(0.92)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .strokeBorder(.white.opacity(0.05), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.2), radius: 12, x: 0, y: 8)
    }

    private static let logDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy년 MM월 dd일"
        return formatter
    }()

    private static let logTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss에 기록됨"
        return formatter
    }()

    // MARK: - Zen Calligraphy Calendar Helpers

    private var currentMonthYearText: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy년 M월 정진표"
        return formatter.string(from: currentCalendarMonth)
    }

    private var daysInCurrentMonth: [Date?] {
        let calendar = Calendar.current
        guard let monthRange = calendar.range(of: .day, in: .month, for: currentCalendarMonth) else { return [] }

        let components = calendar.dateComponents([.year, .month], from: currentCalendarMonth)
        guard let firstOfMonth = calendar.date(from: components) else { return [] }

        let weekday = calendar.component(.weekday, from: firstOfMonth)

        var days: [Date?] = Array(repeating: nil, count: weekday - 1)
        for day in 1...monthRange.count {
            if let date = calendar.date(byAdding: .day, value: day - 1, to: firstOfMonth) {
                days.append(date)
            }
        }
        return days
    }

    private func totalDurationForDate(_ date: Date) -> TimeInterval {
        let calendar = Calendar.current
        return store.sessionLog
            .filter { calendar.isDate($0.date, inSameDayAs: date) }
            .reduce(0.0) { $0 + $1.duration }
    }

    private func calendarCellColor(duration: TimeInterval, isToday: Bool) -> Color {
        guard duration > 0 else {
            return isToday ? Color.white.opacity(0.12) : Color.white.opacity(0.04)
        }
        
        if duration < 900 { // 1각(15분) 미만: 미약한 돌색
            return CaveTheme.stone.opacity(0.3)
        } else if duration < 7200 { // 1시진(2시간) 미만: 공력이 약한 비취색
            return CaveTheme.jade.opacity(0.55)
        } else if duration < 14400 { // 2시간(1시진) 이상 4시간 미만: 조금 더 강한 연한 황금빛
            return CaveTheme.gold.opacity(0.4)
        } else if duration < 28800 { // 4시간 이상 8시간 미만: 더욱 강한 짙은 황금빛
            return CaveTheme.gold.opacity(0.85)
        } else if duration < 50400 { // 8시간 이상 14시간 미만: 더더욱 강한 진기의 붉은 빛
            return CaveTheme.ember.opacity(0.9)
        } else { // 14시간 이상: 최고의 황금색 극의 경지
            return CaveTheme.gold
        }
    }

    private func formatCompactDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        if mins >= 60 {
            let hrs = mins / 60
            let remMins = mins % 60
            return remMins > 0 ? "\(hrs)h\(remMins)m" : "\(hrs)h"
        }
        return "\(mins)m"
    }

    // MARK: - 정진 일력 달력 뷰
    private var zenCalendarBlock: some View {
        VStack(alignment: .leading, spacing: 14) {

            // ── 헤더: 이전/다음 달 이동 버튼 ──
            HStack(spacing: 0) {
                Text("정진 일력 (精進日曆)")
                    .font(.system(size: 18, weight: .bold, design: .serif))
                    .foregroundStyle(CaveTheme.gold)

                Spacer()

                // 이전 달
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        currentCalendarMonth = Calendar.current.date(
                            byAdding: .month, value: -1, to: currentCalendarMonth
                        ) ?? currentCalendarMonth
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(CaveTheme.gold)
                        .frame(width: 32, height: 32)
                        .background(Color.white.opacity(0.07))
                        .clipShape(Circle())
                }

                Text(currentMonthYearText)
                    .font(.system(size: 12, weight: .semibold, design: .serif))
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.horizontal, 8)

                // 다음 달
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        currentCalendarMonth = Calendar.current.date(
                            byAdding: .month, value: +1, to: currentCalendarMonth
                        ) ?? currentCalendarMonth
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(CaveTheme.gold)
                        .frame(width: 32, height: 32)
                        .background(Color.white.opacity(0.07))
                        .clipShape(Circle())
                }
            }

            // ── 요일 헤더 ──
            let weekdays = ["일", "월", "화", "수", "목", "금", "토"]
            HStack(spacing: 0) {
                ForEach(weekdays, id: \.self) { day in
                    Text(day)
                        .font(.system(size: 11, weight: .bold, design: .serif))
                        .foregroundStyle(.white.opacity(0.3))
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 4)

            // ── 날짜 그리드 ──
            let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(0..<daysInCurrentMonth.count, id: \.self) { index in
                    if let date = daysInCurrentMonth[index] {
                        let duration = totalDurationForDate(date)
                        let isToday = Calendar.current.isDateInToday(date)
                        let hasNote = store.sessionNotes[noteKey(for: date)] != nil
                            && !(store.sessionNotes[noteKey(for: date)]?.isEmpty ?? true)
                        let isFuture = date > Date()

                        Button {
                            guard !isFuture else { return }
                            selectedDate = date
                            isShowingDayDetail = true
                        } label: {
                            VStack(spacing: 2) {
                                Text("\(Calendar.current.component(.day, from: date))")
                                    .font(.system(size: 11, weight: .black, design: .serif))
                                    .foregroundStyle(
                                        isFuture ? .white.opacity(0.2)
                                        : duration > 0 ? Color.black
                                        : (isToday ? CaveTheme.gold : .white.opacity(0.6))
                                    )

                                if duration > 0 {
                                    Text(formatCompactDuration(duration))
                                        .font(.system(size: 7, weight: .black, design: .rounded))
                                        .foregroundStyle(Color.black.opacity(0.8))
                                } else if hasNote {
                                    // 메모만 있는 날 → 작은 붓 아이콘
                                    Image(systemName: "pencil.tip")
                                        .font(.system(size: 6))
                                        .foregroundStyle(CaveTheme.jade.opacity(0.8))
                                } else {
                                    Color.clear.frame(height: 10)
                                }
                            }
                            .frame(height: 38)
                            .frame(maxWidth: .infinity)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(isFuture
                                          ? Color.clear
                                          : calendarCellColor(duration: duration, isToday: isToday))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .strokeBorder(
                                        isToday ? CaveTheme.gold.opacity(0.6) : Color.clear,
                                        lineWidth: 1.5
                                    )
                            )
                        }
                        .buttonStyle(.plain)
                    } else {
                        Color.clear.frame(height: 38)
                    }
                }
            }
        }
        .padding(20)
        .background(stonePanel)
    }
}

// ── 무림의 일일 고찰 데이터 구조체 ──
private struct WulinDailyInsight {
    let chinese: String
    let rank: String
    let message: String
    let calendarColor: Color
    let accentColor: Color

    static func forDuration(_ duration: TimeInterval) -> WulinDailyInsight {
        if duration <= 0 {
            return WulinDailyInsight(
                chinese: "學如逆水行舟 不進則退",
                rank: "정진이 멈춘 범협 (凡俠)",
                message: "학업과 수련은 물을 거스르는 배와 같아, 나아가지 않으면 곧 퇴보하는 법이오(學如逆水行舟 不進則退). 매화는 모진 추위를 견뎌내야만 맑은 향기를 뿜어내며(梅經寒雪香更濃), 대나무는 마디가 있어야 곧게 자랄 수 있소. 오늘 하루 검을 쥐지 않고 마음을 방치하였으니, 단전에 차오르던 온기가 식고 잡념의 먼지가 겹겹이 쌓였구려. 정진을 게을리하는 자는 결코 강호의 넓은 뜻을 품을 수 없소. 일각(15분)의 시간이라도 내어 흐트러진 호흡을 잡고 내일은 필히 가부좌를 틀어보시오.",
                calendarColor: Color.white.opacity(0.04),
                accentColor: Color.red
            )
        } else if duration < 900 {
            return WulinDailyInsight(
                chinese: "千里之行 始於足下",
                rank: "미약한 입문 (入門)",
                message: "천리 길도 한 걸음부터 시작하는 법이오(千里之行 始於足下). 비록 오늘의 정진은 차 한 잔 마실 시간(1다경)에도 미치지 못하여 내력의 깊이가 아주 미약하지만, 가부좌를 틀고 정진을 시도했다는 사실 자체가 의미 있소. 물방울이 모여 연못을 이루듯, 내일은 조금 더 오랜 시간 단전에 집중하여 가부좌를 지켜보시오.",
                calendarColor: CaveTheme.stone.opacity(0.3),
                accentColor: CaveTheme.stone
            )
        } else if duration < 7200 {
            return WulinDailyInsight(
                chinese: "欲速則不達",
                rank: "미진한 초입 (初步)",
                message: "시작은 하였으나 아직 기운이 얕고 깊이가 미진하오. 속히 이루고자 하면 도달하지 못하니(欲速則不達), 조급함을 거두고 호흡을 다스리시오. 난초가 숲속에서 은은한 향을 풍기듯(蘭生幽谷), 참된 공부는 묵묵히 쌓는 법이오. 오늘의 공부는 아직 1시진(2시간)에 이르지 못했으니 내일은 조금 더 호흡을 길게 하여 정진의 깊이를 더해보시오.",
                calendarColor: CaveTheme.jade.opacity(0.55),
                accentColor: CaveTheme.jade
            )
        } else if duration < 14400 {
            return WulinDailyInsight(
                chinese: "積土成山",
                rank: "기초를 다지는 축기 (築基)",
                message: "흙을 쌓아 산을 이루면 바람과 비가 일어나는 법이오(積土成山). 1시진(2시간)을 넘어선 정진은 그대 내면의 기틀을 잡는 축기의 과정이오. 소나무가 서리 속에서도 푸르름을 지키듯(松茂竹苞), 오늘의 노력은 미래의 거대한 내공을 지탱할 주춧돌이 될 것이니 흔들림 없이 묵묵하게 나아가시오.",
                calendarColor: CaveTheme.gold.opacity(0.4),
                accentColor: CaveTheme.gold.opacity(0.7)
            )
        } else if duration < 28800 {
            return WulinDailyInsight(
                chinese: "水滴石穿",
                rank: "명성 높은 일류 (一流)",
                message: "낙숫물이 끊임없이 떨어지면 마침내 단단한 돌을 뚫어 내오(水滴石穿). 네 시간(2시진) 이상 정신을 집중한 그대의 집념은 참으로 대단하오. 사군자 중 매화가 고난 속에서도 맑은 향기를 더하듯(梅經寒雪香更濃), 오늘의 진전은 그대의 무공을 일류로 이끌 명백한 증거요. 이 맑은 기운을 잃지 말고 내일도 칼끝을 곧게 세우시오.",
                calendarColor: CaveTheme.gold.opacity(0.85),
                accentColor: CaveTheme.gold
            )
        } else if duration < 50400 {
            return WulinDailyInsight(
                chinese: "韋編三絕",
                rank: "탈태환골의 화경 (化境)",
                message: "가죽 끈이 세 번 끊어질 정도로 책을 읽는 독공의 정수(韋編三絕)를 오늘 그대가 몸소 보여주었소. 여덟 시간(4시진)을 넘긴 깊은 참선은 번뇌를 지우고 온몸의 뼈를 새로이 맞추는 탈태환골(奪胎換骨)의 경지이오. 그대의 정신은 이미 범庸함을 벗어났으니, 오늘 축적한 내력은 그대의 굳건한 방패이자 무기가 될 것이오.",
                calendarColor: CaveTheme.ember.opacity(0.9),
                accentColor: CaveTheme.ember
            )
        } else {
            return WulinDailyInsight(
                chinese: "登峰造極",
                rank: "천하무쌍 (天下無雙)",
                message: "마침내 최고 봉우리에 올라 극한에 도달하였소(登峰造極). 14시간 이상의 정진은 인간의 한계를 시험하고 신화에 이르는 정진이오. 대나무가 하늘 높이 곧게 뻗어 그 절개를 증명하듯, 그대의 집념은 만인의 본보기가 되리니 강호의 모든 고수들이 그대의 집념 어린 성취에 경의를 표할 것이오.",
                calendarColor: CaveTheme.gold,
                accentColor: CaveTheme.gold
            )
        }
    }

    static func formatTraditionalDuration(_ seconds: TimeInterval) -> String {
        let totalMinutes = Int(seconds) / 60
        if totalMinutes <= 0 { return "무정진 (無精進)" }
        
        var parts: [String] = []
        var temp = totalMinutes
        
        let sijin = temp / 120
        temp %= 120
        
        let sikgyeong = temp / 30
        temp %= 30
        
        let gak = temp / 15
        temp %= 15
        
        if sijin > 0 { parts.append("\(sijin)시진(時辰)") }
        if sikgyeong > 0 { parts.append("\(sikgyeong)식경(食頃)") }
        if gak > 0 { parts.append("\(gak)각(刻)") }
        if temp > 0 {
            if temp >= 10 {
                parts.append("1다경(茶頃)")
            } else {
                parts.append("\(temp)분")
            }
        }
        
        return parts.joined(separator: " ")
    }

    static func gyeongText(for date: Date) -> String {
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: date)
        
        switch hour {
        case 19, 20:
            return "초경(初更)"
        case 21, 22:
            return "이경(二更)"
        case 23, 0:
            return "삼경(三更) 깊은 밤"
        case 1, 2:
            return "사경(四更) 새벽녘"
        case 3, 4:
            return "오경(五更) 동트기 전"
        case 5..<12:
            return "조침(朝枕) 아침"
        case 12..<19:
            return "일중(日中) 낮"
        default:
            return "일중(日中)"
        }
    }
}

// ── 정진 일력 날짜 상세 시트 ──
struct DayDetailSheet: View {
    @ObservedObject var store: StudySessionStore
    let date: Date

    @State private var memoText: String = ""
    @State private var isAdviceExpanded: Bool = false // 고언 펼치기/접기 상태
    @Environment(\.dismiss) private var dismiss

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy년 M월 d일 (EEEE)"
        f.locale = Locale(identifier: "ko_KR")
        return f
    }()
    private static let keyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private var noteKey: String { Self.keyFormatter.string(from: date) }

    private var todaySessions: [StudySessionStore.SessionEntry] {
        let cal = Calendar.current
        return store.sessionLog.filter { cal.isDate($0.date, inSameDayAs: date) }
    }
    private var totalDuration: TimeInterval {
        todaySessions.reduce(0) { $0 + $1.duration }
    }
    private var dailyInsight: WulinDailyInsight {
        WulinDailyInsight.forDuration(totalDuration)
    }

    var body: some View {
        ZStack {
            // 배경 그라디언트 명확하게 렌더링되게 보장
            LinearGradient(
                colors: [CaveTheme.backgroundTop, CaveTheme.backgroundBottom],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // ── 상단 커스텀 헤더 ──
                HStack {
                    Text("수련 고찰 (修練考察)")
                        .font(.system(size: 16, weight: .bold, design: .serif))
                        .foregroundStyle(CaveTheme.gold)
                    Spacer()
                    Button {
                        // 닫기 전 최종 메모 저장 보장
                        store.sessionNotes[noteKey] = memoText
                        dismiss()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "xmark")
                            Text("하산")
                        }
                        .font(.system(size: 13, weight: .bold, design: .serif))
                        .foregroundStyle(CaveTheme.gold)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.06))
                        .cornerRadius(8)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 12)

                Divider()
                    .background(Color.white.opacity(0.1))

                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {

                        // ── 날짜 및 전통 시간 정보 헤더 ──
                        VStack(alignment: .leading, spacing: 8) {
                            Text(Self.dateFormatter.string(from: date))
                                .font(.system(size: 20, weight: .bold, design: .serif))
                                .foregroundStyle(CaveTheme.gold)
                            
                            if totalDuration > 0 {
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack(spacing: 6) {
                                        Image(systemName: "flame.fill")
                                            .foregroundStyle(CaveTheme.ember)
                                            .font(.system(size: 12))
                                        Text("총 \(CaveTimeFormatter.format(seconds: totalDuration)) 수련")
                                            .font(.system(size: 14, weight: .bold, design: .serif))
                                            .foregroundStyle(.white.opacity(0.85))
                                    }
                                    Text("공력 환산 : \(WulinDailyInsight.formatTraditionalDuration(totalDuration))")
                                        .font(.system(size: 12, weight: .semibold, design: .serif))
                                        .foregroundStyle(CaveTheme.jade)
                                }
                            } else {
                                Text("이날은 단전에 진기를 모은 기록이 없소.")
                                    .font(.system(size: 14, design: .serif))
                                    .foregroundStyle(.white.opacity(0.4))
                            }
                        }

                        // ── 오늘의 경지와 깨달음 (무학의 고언) ──
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(spacing: 10) {
                                Image("CaveHermit")
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 34, height: 34)
                                    .clipShape(Circle())
                                    .overlay(Circle().stroke(dailyInsight.accentColor.opacity(0.45), lineWidth: 1))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text("무학의 고언 (武學의 苦言)")
                                        .font(.system(size: 13, weight: .bold, design: .serif))
                                        .foregroundStyle(dailyInsight.accentColor)
                                    Text("경지 : \(dailyInsight.rank)")
                                        .font(.system(size: 12, weight: .semibold, design: .serif))
                                        .foregroundStyle(.white.opacity(0.62))
                                }
                                Spacer()
                            }

                            HStack {
                                Text(dailyInsight.chinese)
                                    .font(.system(size: 18, weight: .black, design: .serif))
                                    .foregroundStyle(dailyInsight.accentColor)
                                    .minimumScaleFactor(0.75)
                                    .lineLimit(1)
                                
                                Spacer()
                                
                                Button {
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                                        isAdviceExpanded.toggle()
                                    }
                                } label: {
                                    HStack(spacing: 3) {
                                        Text(isAdviceExpanded ? "간략히" : "고언 펼치기")
                                        Image(systemName: isAdviceExpanded ? "chevron.up" : "chevron.down")
                                    }
                                    .font(.system(size: 11, weight: .bold, design: .serif))
                                    .foregroundStyle(dailyInsight.accentColor)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(dailyInsight.accentColor.opacity(0.12))
                                    .cornerRadius(6)
                                }
                            }

                            if isAdviceExpanded {
                                Text(dailyInsight.message)
                                    .font(.system(size: 13, weight: .medium, design: .serif))
                                    .foregroundStyle(.white.opacity(0.86))
                                    .lineSpacing(4)
                                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
                            }
                        }
                        .padding(14)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(dailyInsight.accentColor.opacity(0.08))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .strokeBorder(dailyInsight.accentColor.opacity(0.2), lineWidth: 1)
                                )
                        )

                        // ── 수련 세션 리스트 ──
                        if !todaySessions.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("수련 기록 (修練記錄)")
                                    .font(.system(size: 15, weight: .bold, design: .serif))
                                    .foregroundStyle(CaveTheme.gold)
                                
                                ForEach(todaySessions) { session in
                                    SessionRowView(session: session, store: store)
                                }
                            }
                        }

                        // ── 나의 수련 정진록 (성찰 메모) ──
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 6) {
                                Image(systemName: "pencil.tip")
                                    .foregroundStyle(CaveTheme.jade)
                                    .font(.system(size: 13))
                                Text("수련 정진록 (修練精進錄)")
                                    .font(.system(size: 15, weight: .bold, design: .serif))
                                    .foregroundStyle(CaveTheme.jade)
                            }
                            
                            TextEditor(text: $memoText)
                                .font(.system(size: 14, design: .serif))
                                .foregroundStyle(.white)
                                .scrollContentBackground(.hidden)
                                .frame(minHeight: 100)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(Color.white.opacity(0.05))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                .strokeBorder(CaveTheme.jade.opacity(0.25), lineWidth: 1)
                                        )
                                )
                            
                            Text("오늘 수련의 깨달음이나 내일 나아갈 무도의 길을 적어두시오.")
                                .font(.system(size: 11, design: .serif))
                                .foregroundStyle(.white.opacity(0.3))
                        }

                        // ── 저장 및 닫기 버튼 ──
                        Button {
                            store.sessionNotes[noteKey] = memoText
                            dismiss()
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "checkmark.seal.fill")
                                Text("정진록 기록 및 하산")
                            }
                            .font(.system(size: 15, weight: .bold, design: .serif))
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(CaveTheme.gold)
                            )
                        }
                    }
                    .padding(20)
                }
            }
        }
        .onAppear {
            memoText = store.sessionNotes[noteKey] ?? ""
        }
    }
}

// ── 개별 수련 세션 로우 뷰 ──
struct SessionRowView: View {
    let session: StudySessionStore.SessionEntry
    @ObservedObject var store: StudySessionStore
    @State private var localMemo: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "circle.fill")
                    .font(.system(size: 6))
                    .foregroundStyle(CaveTheme.jade)
                Text(CaveTimeFormatter.format(seconds: session.duration))
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(CaveTheme.jade)
                
                Spacer()
                
                let tf: DateFormatter = {
                    let f = DateFormatter()
                    f.dateFormat = "HH:mm"
                    return f
                }()
                Text("\(WulinDailyInsight.gyeongText(for: session.date)) · \(tf.string(from: session.date))")
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(.white.opacity(0.45))
            }

            // 개별 세션 메모 입력 필드
            HStack(spacing: 8) {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 11))
                    .foregroundStyle(CaveTheme.gold.opacity(0.6))
                
                TextField("연마한 비급이나 수련 내용을 남겨두시오 (예: 화산검법 수련)", text: $localMemo)
                    .font(.system(size: 12, design: .serif))
                    .foregroundStyle(.white)
                    .textFieldStyle(.plain)
                    .onChange(of: localMemo) { newValue in
                        store.updateMemo(entryId: session.id, memoText: newValue)
                    }
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 10)
            .background(Color.white.opacity(0.03))
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(Color.white.opacity(0.06), lineWidth: 1)
            )
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
        .onAppear {
            localMemo = session.memo ?? ""
        }
    }
}

// ── 강호천하도 지도 시스템 (CaveMapView) ──
struct CaveMapView: View {
    @ObservedObject var store: StudySessionStore
    
    @State var activeMapIndex: Int = 0
    @State var isShowingWorldMap: Bool = false
    @State var npcMessage: String? = nil
    @State var isShowingElixirShop: Bool = false
    @State var isPastEra: Bool = false // 과거/현재 시대 맵 전환 상태 추가
    
    // 진기(Jingi) 상승 흐름 입자 시뮬레이션용 상태
    @State var jingiParticles: [JingiParticle] = []
    @State var particleTimer: Timer? = nil
    
    // 비무 결과 팝업 상태
    @State var isShowingSparringResult: Bool = false
    @State var sparringSuccess: Bool = false
    @State var sparringLog: String = ""
    
    enum ParticleEffectType {
        case jingi        // 금빛 진기 (기본 / 소림사)
        case yinYang      // 태극 기류 (흑백 바람 기운 - 무당파)
        case plumBlossom  // 낙화 매화 (매화 꽃잎 - 화산파)
        case demonicMist  // 자흑색 마기 (마교 / 천마신교)
        case fireSparks   // 불꽃 불씨 (녹림채)
        case bambooLeaves // 대나무 잎 (개방)
        case lightning    // 뇌전 전격 (청성파)
        case hermitFog    // 은거 안개 (무명의 오두막)
        case swordQi      // 날카로운 검기 (무림맹)
    }

    struct JingiParticle: Identifiable {
        let id = UUID()
        var x: CGFloat
        var y: CGFloat
        var size: CGFloat
        var opacity: Double
        var speed: CGFloat
        var rotation: Double = 0.0
        var drift: CGFloat = 0.0
        var color: Color = .yellow
        var effectType: ParticleEffectType = .jingi
    }
    
    // 시대에 따른 비경 배경화면 매핑 (과거: 수채화 배경만 사용, 현재: 원본 컬러 일러스트 배경만 사용)
    private func getRegionBackground(for region: MapRegion, isPast: Bool) -> String {
        if isPast {
            switch region.name {
            case "무명의 오두막":
                return "past_wulin_hermit_hut_1783209600000.jpg"
            case "청성파 (靑城派)":
                return "past_wulin_cheongseong.jpg"
            case "무림맹 (武林盟)":
                return "past_wulin_righteous_sect_1783206411012.jpg"
            case "녹림채 (綠林寨)":
                return "past_wulin_outlaw_fort_1783206424103.jpg"
            case "개방 지부 (괴력난신)":
                return "past_wulin_monster_god.jpg"
            case "화산파 (華山派)":
                return "past_wulin_hwasan_return.jpg"
            case "소림사 (少林寺)":
                return "past_wulin_shaolin_secret.jpg"
            case "무당파 (武당파)", "무당파 (武當派)":
                return "past_wulin_wudang_secret.jpg"
            case "천마신교 (天魔神敎)":
                return "past_wulin_demonic_cult_1783206435319.jpg"
            case "화산파 비경 (화산귀환)":
                return "past_wulin_hwasan_secret.jpg"
            case "소림사 비경 (소승림)":
                return "past_wulin_shaolin_secret_past.jpg"
            case "무당파 비경 (태극동천)":
                return "past_wulin_wudang_secret_alt.jpg"
            case "마교 백화전 (나노마신)":
                return "past_wulin_nano_machine.jpg"
            default:
                return region.backgroundAsset
            }
        } else {
            switch region.name {
            case "무명의 오두막":
                return "wulin_hermit_hut_1783226523355.jpg"
            case "청성파 (靑城派)":
                return "wulin_cheongseong_1783226532079.jpg"
            case "무림맹 (武林盟)":
                return "wulin_murim_league_1783226541554.jpg"
            case "녹림채 (綠林寨)":
                return "wulin_outlaw_fort_1783226550587.jpg"
            case "개방 지부 (괴력난신)":
                return "wulin_monster_god_1783226595601.jpg"
            case "화산파 (華山派)":
                return "wulin_hwasan_return_1783226575087.jpg"
            case "소림사 (少林寺)":
                return "wulin_shaolin_secret_1783209492458.jpg"
            case "무당파 (武당파)", "무당파 (武當派)":
                return "wulin_wudang_secret_1783209482524.jpg"
            case "천마신교 (天魔神敎)":
                return "wulin_demonic_cult_1783226558857.jpg"
            case "화산파 비경 (화산귀환)":
                return "wulin_hwasan_secret_1783209500334.jpg"
            case "소림사 비경 (소승림)":
                return "wulin_shaolin_secret_alt.jpg"
            case "무당파 비경 (태극동천)":
                return "wulin_wudang_secret_alt.jpg"
            case "마교 백화전 (나노마신)":
                return "wulin_nano_machine_1783226585538.jpg"
            default:
                return region.backgroundAsset
            }
        }
    }
    
    // 시대에 따른 고수 프로필 인물 매핑 (과거: 수채화 스케치 인물, 현재: 원본 고퀄리티 컬러 일러스트 인물)
    private func getRegionNpcAvatar(for region: MapRegion, isPast: Bool) -> String {
        switch region.name {
        case "무명의 오두막":
            return isPast ? "past_wulin_npc_hermit.png" : "wulin_avatar_hermit.jpg"
        case "청성파 (靑城派)":
            return isPast ? "past_wulin_npc_wind_elder.png" : "wulin_avatar_songdoin.jpg"
        case "무림맹 (武林盟)":
            return isPast ? "past_wulin_npc_murimleague.png" : "wulin_avatar_murimleague.jpg"
        case "녹림채 (綠林寨)":
            return isPast ? "past_wulin_npc_outlaw_chief.png" : "wulin_avatar_limsobyeong.jpg"
        case "개방 지부 (괴력난신)":
            return isPast ? "past_wulin_npc_gaebang_elder.png" : "wulin_avatar_sashin_1783226657778.jpg"
        case "화산파 (華山派)":
            return isPast ? "past_wulin_npc_maehwagemsu.png" : "wulin_avatar_maehwagemsu.jpg"
        case "소림사 (少林寺)":
            return isPast ? "past_wulin_npc_shaolin_abbot.png" : "wulin_avatar_shaolinabbot.jpg"
        case "무당파 (武당파)", "무당파 (武當派)":
            return isPast ? "past_wulin_npc_jang_sampung.png" : "wulin_avatar_wudangmaster.jpg"
        case "천마신교 (天魔神敎)":
            return isPast ? "past_wulin_npc_heavenly_demon.png" : "wulin_avatar_gwangma.jpg"
        case "화산파 비경 (화산귀환)":
            return isPast ? "past_wulin_npc_cheongmyeong.png" : "wulin_avatar_cheongmyeong_1783226635757.jpg"
        case "소림사 비경 (소승림)":
            return isPast ? "past_wulin_npc_nahansuajwa.png" : "wulin_avatar_nahansuajwa.jpg"
        case "무당파 비경 (태극동천)":
            return isPast ? "past_wulin_npc_jang_sampung_alt.png" : "wulin_avatar_jangsampung_color.jpg"
        case "마교 백화전 (나노마신)":
            return isPast ? "past_wulin_npc_yeowun.png" : "wulin_avatar_yeowun_1783226647473.jpg"
        default:
            return region.npcAvatar
        }
    }
    
    // 13개 문파 지리 데이터 정의 (정교하게 매핑된 고유 NPC 아바타 및 배경 탑재)
    let regions: [MapRegion] = [
        MapRegion(
            name: "무명의 오두막",
            description: "속세를 떠난 은거 기인이 초심자들을 인도하는 평화로운 오두막터요.",
            mapX: 0.30, mapY: 0.58,
            requiredHours: 0.0,
            backgroundAsset: "wulin_hermit_hut_1783226523355.jpg",
            themeSoundscape: "Tiger Spirit",
            npcName: "무명 노인",
            npcAvatar: "WulinNpcHermit",
            npcLine: "폐관수련을 통해 기경팔맥을 뚫고 무림의 일류 고수가 되어보시오.",
            isSecretRoute: false, secretSectKey: nil
        ),
        MapRegion(
            name: "청성파 (靑城派)",
            description: "사천 청성산에 웅거하는 문파로, 바람을 가르는 쾌검술로 이름이 높소.",
            mapX: 0.16, mapY: 0.65,
            requiredHours: 1.0,
            backgroundAsset: "wulin_cheongseong_1783226532079.jpg",
            themeSoundscape: "Lotus Zen",
            npcName: "송도인",
            npcAvatar: "WulinNpcWindElder",
            npcLine: "청성파의 쾌검은 바람을 가른다네. 자네의 집중은 어떠한가?",
            isSecretRoute: false, secretSectKey: nil
        ),
        MapRegion(
            name: "무림맹 (武林盟)",
            description: "천하 정파 무림인들이 집결한 웅장한 전당으로 정파 공도의 수호지이외다.",
            mapX: 0.45, mapY: 0.52,
            requiredHours: 3.0,
            backgroundAsset: "wulin_murim_league_1783226541554.jpg",
            themeSoundscape: "Lotus Zen",
            npcName: "맹주부 집행검사",
            npcAvatar: "WulinNpcShaolinAbbot",
            npcLine: "정사대전의 기운이 감도니, 맹의 무사들이여 집중을 풀지 마십시오!",
            isSecretRoute: false, secretSectKey: nil
        ),
        MapRegion(
            name: "녹림채 (綠林寨)",
            description: "험준한 협곡에 자리잡은 수적과 산적의 근거지로, 천하 오패의 기세가 서렸소.",
            mapX: 0.68, mapY: 0.75,
            requiredHours: 6.0,
            backgroundAsset: "wulin_outlaw_fort_1783226550587.jpg",
            themeSoundscape: "Tiger Spirit",
            npcName: "채주 임소병",
            npcAvatar: "WulinNpcOutlawChief",
            npcLine: "돈을 내놓겠느냐, 네 정신을 내놓겠느냐? 농담일세 하하하!",
            isSecretRoute: false, secretSectKey: nil
        ),
        MapRegion(
            name: "개방 지부 (괴력난신)",
            description: "구걸과 첩보의 달인들이 모인 장터 지부로, 보이지 않는 귀신의 음기를 감시하오.",
            mapX: 0.52, mapY: 0.62,
            requiredHours: 10.0,
            backgroundAsset: "wulin_monster_god_1783226595601.jpg",
            themeSoundscape: "Phoenix Focus",
            npcName: "개방 장로",
            npcAvatar: "WulinNpcWindElder",
            npcLine: "귀신과 괴력도 굳건한 정신 앞에서는 힘을 쓰지 못하는 법이지.",
            isSecretRoute: false, secretSectKey: nil
        ),
        MapRegion(
            name: "화산파 (華山派)",
            description: "섬서 화산 자락에 만개한 분홍빛 매화와 서릿발 같은 검기가 돋보이는 명숙이외다.",
            mapX: 0.78, mapY: 0.45,
            requiredHours: 15.0,
            backgroundAsset: "wulin_hwasan_return_1783226575087.jpg",
            themeSoundscape: "Phoenix Focus",
            npcName: "매화 검수",
            npcAvatar: "WulinNpcCheongmyeong",
            npcLine: "매화 향기가 사방에 진동하니, 검끝에 서린 일념을 느껴보시오.",
            isSecretRoute: false, secretSectKey: nil
        ),
        MapRegion(
            name: "소림사 (少林寺)",
            description: "숭산에 우뚝 솟은 정종 무학의 태산북두로 고요한 불법과 범종소리가 가득하오.",
            mapX: 0.22, mapY: 0.38,
            requiredHours: 25.0,
            backgroundAsset: "wulin_shaolin_secret_1783209492458.jpg",
            themeSoundscape: "Lotus Zen",
            npcName: "현공 방장",
            npcAvatar: "WulinNpcShaolinAbbot",
            npcLine: "아미타불, 마음을 한 곳에 집중하는 것이 곧 선(禪)이자 깨달음입니다.",
            isSecretRoute: false, secretSectKey: nil
        ),
        MapRegion(
            name: "무당파 (武當派)",
            description: "균주 무당산에 감도는 태극과 부드러운 도가 내가기예의 태산북두이외다.",
            mapX: 0.50, mapY: 0.28,
            requiredHours: 40.0,
            backgroundAsset: "wulin_wudang_secret_1783209482524.jpg",
            themeSoundscape: "Lotus Zen",
            npcName: "송혜 도장",
            npcAvatar: "WulinNpcJangSampung",
            npcLine: "태극의 원리는 멈추지 않는 순환이지요. 호흡을 가다듬으십시오.",
            isSecretRoute: false, secretSectKey: nil
        ),
        MapRegion(
            name: "천마신교 (天魔神敎)",
            description: "십만대산 깊숙이 솟은 마도의 성지로 절대적인 강함와 패도 무공을 숭상하오.",
            mapX: 0.88, mapY: 0.58,
            requiredHours: 60.0,
            backgroundAsset: "wulin_demonic_cult_1783226558857.jpg",
            themeSoundscape: "Dragon Focus",
            npcName: "광마 (狂魔)",
            npcAvatar: "WulinNpcHeavenlyDemon",
            npcLine: "마공을 단련함에 있어 잡념은 곧 주화입마를 부를 뿐이다.",
            isSecretRoute: false, secretSectKey: nil
        ),
        MapRegion(
            name: "화산파 비경 (화산귀환)",
            description: "화산 최고 봉우리에 감춰진 검선들의 비무 처소로, 매화검의 오의가 춤추오.",
            mapX: 0.84, mapY: 0.34,
            requiredHours: 0.0,
            backgroundAsset: "wulin_hwasan_secret_1783209500334.jpg",
            themeSoundscape: "Phoenix Focus",
            npcName: "화산 신룡 청명",
            npcAvatar: "WulinNpcCheongmyeong",
            npcLine: "대가리가 깨져도 화산은 간다! 진기를 쏟아 무념의 검을 휘두르란 말이다!",
            isSecretRoute: true, secretSectKey: "hwasan"
        ),
        MapRegion(
            name: "소림사 비경 (소승림)",
            description: "소림사 뒤편 대숲에 숨겨진 동천으로 고승들의 십팔나한진 공력이 흐르오.",
            mapX: 0.18, mapY: 0.26,
            requiredHours: 0.0,
            backgroundAsset: "wulin_shaolin_secret_1783209492458.jpg",
            themeSoundscape: "Lotus Zen",
            npcName: "나한 수좌",
            npcAvatar: "WulinNpcShaolinAbbot",
            npcLine: "진정한 신체와 정신의 결합은 고난의 수련 끝에 완성됩니다.",
            isSecretRoute: true, secretSectKey: "shaolin"
        ),
        MapRegion(
            name: "무당파 비경 (태극동천)",
            description: "무당산 절정의 음양 결계로 둘러싸인 동굴로 태극혜검의 비의가 서렸소.",
            mapX: 0.52, mapY: 0.15,
            requiredHours: 0.0,
            backgroundAsset: "wulin_wudang_secret_1783209482524.jpg",
            themeSoundscape: "Lotus Zen",
            npcName: "진인 장삼풍",
            npcAvatar: "WulinNpcJangSampung",
            npcLine: "태극이 무극이 되고 무극이 곧 하나가 되니, 무념무상의 경지에 오르라.",
            isSecretRoute: true, secretSectKey: "wudang"
        ),
        MapRegion(
            name: "마교 백화전 (나노마신)",
            description: "나노 머신 인공지능 분석기로 정신 집중 뇌파를 극대화하는 마도 최첨단 전당이외다.",
            mapX: 0.90, mapY: 0.42,
            requiredHours: 0.0,
            backgroundAsset: "wulin_demonic_cult_1783206435319.jpg",
            themeSoundscape: "Dragon Focus",
            npcName: "천마 천여운",
            npcAvatar: "WulinNpcHeavenlyDemon",
            npcLine: "나노 마신이 작동합니다. 뇌파 동조율 100%, 집중을 가속하십시오.",
            isSecretRoute: true, secretSectKey: "nanomachine"
        )
    ]
    
    var activeRegion: MapRegion {
        if activeMapIndex >= 0 && activeMapIndex < regions.count {
            return regions[activeMapIndex]
        }
        return regions[0]
    }
    
    func themeSoundscapeKorean(for english: String) -> String {
        switch english {
        case "Tiger Spirit":
            return "백호 포효 바람소리"
        case "Lotus Zen":
            return "수호신룡 천룡명상"
        case "Dragon Thunder", "Dragon Focus":
            return "이무기 심연 우레음"
        case "Bamboo Spirit":
            return "대붕 설산 바람소리"
        case "Cave Hermit", "Phoenix Focus":
            return "용귀 파도 동종소리"
        default:
            return "동굴 낙수 소리"
        }
    }
}
// ── 강호 맵 데이터 모델 구조체 ──
struct MapRegion: Identifiable {
    let id = UUID()
    let name: String
    let description: String
    let mapX: Double
    let mapY: Double
    let requiredHours: Double
    let backgroundAsset: String
    let themeSoundscape: String
    let npcName: String
    let npcAvatar: String
    let npcLine: String
    let isSecretRoute: Bool
    let secretSectKey: String?
}
// ── 파트 1 끝 ──

extension CaveMapView {
    var body: some View {
        let isLocked = !checkUnlocked(index: activeMapIndex)
        return ZStack {
            // 1. 현재 활성화된 무협지 배경 렌더링
            WulinImageView(filename: getRegionBackground(for: activeRegion, isPast: isPastEra))
                .ignoresSafeArea()
                .id(activeMapIndex)
                .blur(radius: isLocked ? 8 : 0)
                .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 1.05)), removal: .opacity))
            
            // 한지 감성의 어두운 그라데이션 오버레이
            LinearGradient(
                gradient: Gradient(colors: [.black.opacity(0.45), .clear, .black.opacity(0.85)]),
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            // 각 문파 및 구역 특색에 따른 다채로운 진기/기류/원소 이팩트 엔진
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                
                ZStack {
                    ForEach(jingiParticles) { p in
                        Group {
                            switch p.effectType {
                            case .jingi:
                                // 소림사 / 기본: 은은하게 흐르는 황금빛 진기 입자
                                Circle()
                                    .fill(p.color.opacity(p.opacity))
                                    .frame(width: p.size, height: p.size)
                                    .blur(radius: 0.5)
                                
                            case .yinYang:
                                // 무당파: 흑백 태극의 기운이 깃든 바람 안개
                                Circle()
                                    .fill(p.color.opacity(p.opacity))
                                    .frame(width: p.size * 2, height: p.size * 2)
                                    .blur(radius: p.size * 0.4)
                                
                            case .plumBlossom:
                                // 화산파: 사방에 낙화하며 살랑살랑 휘날리는 매화 꽃잎
                                Path { path in
                                    path.move(to: CGPoint(x: p.size / 2, y: 0))
                                    path.addQuadCurve(to: CGPoint(x: p.size, y: p.size / 2), control: CGPoint(x: p.size, y: 0))
                                    path.addQuadCurve(to: CGPoint(x: p.size / 2, y: p.size), control: CGPoint(x: p.size, y: p.size))
                                    path.addQuadCurve(to: CGPoint(x: 0, y: p.size / 2), control: CGPoint(x: 0, y: p.size))
                                    path.addQuadCurve(to: CGPoint(x: p.size / 2, y: 0), control: CGPoint(x: 0, y: 0))
                                }
                                .fill(p.color.opacity(p.opacity))
                                .frame(width: p.size, height: p.size)
                                .rotationEffect(.degrees(p.rotation))
                                
                            case .demonicMist:
                                // 천마신교 / 마교: 솟구쳐 오르는 암흑 자색 마기
                                Circle()
                                    .fill(p.color.opacity(p.opacity))
                                    .frame(width: p.size * 1.5, height: p.size * 1.5)
                                    .blur(radius: p.size * 0.3)
                                
                            case .fireSparks:
                                // 녹림채: 거친 활화산 또는 야영지의 오렌지빛 불티 불씨
                                Circle()
                                    .fill(p.color.opacity(p.opacity))
                                    .frame(width: p.size, height: p.size)
                                    .shadow(color: p.color.opacity(0.8), radius: 2)
                                
                            case .bambooLeaves:
                                // 개방: 휘날려 떨어지는 대나무 잎사귀
                                Ellipse()
                                    .fill(p.color.opacity(p.opacity))
                                    .frame(width: p.size * 0.4, height: p.size * 1.8)
                                    .rotationEffect(.degrees(p.rotation))
                                
                            case .lightning:
                                // 청성파: 찌릿하고 신속하게 폭발하는 전격 뇌전 스파크
                                Rectangle()
                                    .fill(p.color.opacity(p.opacity))
                                    .frame(width: p.size * 0.2, height: p.size * 1.8)
                                    .rotationEffect(.degrees(p.rotation))
                                
                            case .hermitFog:
                                // 무명의 오두막: 유유히 평화롭게 흐르는 안개 구름
                                Circle()
                                    .fill(p.color.opacity(p.opacity))
                                    .frame(width: p.size * 3.5, height: p.size * 1.8)
                                    .blur(radius: p.size * 0.6)
                                
                            case .swordQi:
                                // 무림맹: 비처럼 내리꽂히는 날카로운 청색 검기 기운
                                Capsule()
                                    .fill(p.color.opacity(p.opacity))
                                    .frame(width: 1.5, height: p.size * 2.8)
                                    .shadow(color: p.color.opacity(0.6), radius: 2)
                            }
                        }
                        .position(x: p.x * w, y: p.y * h)
                    }
                }
            }
            .ignoresSafeArea()
            .blur(radius: isLocked ? 8 : 0)
            
            VStack(spacing: 0) {
                // 2. 상단 헤더 영역 (현 위치 & 영약 버프 표시)
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(activeRegion.name)
                            .font(.system(size: 24, weight: .black, design: .serif))
                            .foregroundStyle(CaveTheme.gold)
                            .shadow(color: .black, radius: 4)
                        
                        Text(activeRegion.description)
                            .font(.system(size: 12, weight: .medium, design: .serif))
                            .foregroundStyle(.white.opacity(0.8))
                            .lineLimit(2)
                            .frame(maxWidth: 240, alignment: .leading)
                    }
                    
                    Spacer()
                    
                    // 영약 버프 HUD (터치 시 지속 정보 드러남)
                    Button(action: {
                        isShowingElixirShop = true
                        triggerHaptic(.light)
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: store.activeBuffRemainingSeconds > 0 ? "flame.fill" : "pills.fill")
                                .font(.system(size: 13))
                                .foregroundStyle(store.activeBuffRemainingSeconds > 0 ? CaveTheme.gold : .white.opacity(0.6))
                            
                            if store.activeBuffRemainingSeconds > 0 {
                                // 버프 적용 중 (클릭 시 팝업 띄움)
                                Text("영약단 효력 중 (\(Int(store.gongryeokMultiplier * 10) / 10)배)")
                                    .font(.system(size: 11, weight: .bold, design: .serif))
                                    .foregroundStyle(CaveTheme.gold)
                            } else {
                                Text("영약 제조")
                                    .font(.system(size: 11, weight: .bold, design: .serif))
                                    .foregroundStyle(.white.opacity(0.8))
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.7))
                        .cornerRadius(8)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(store.activeBuffRemainingSeconds > 0 ? CaveTheme.gold.opacity(0.5) : Color.white.opacity(0.12), lineWidth: 1)
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 60)
                
                Spacer()
                
                // 3. 중단 캐릭터 말풍선 대화방
                VStack(spacing: 12) {
                    HStack(alignment: .bottom, spacing: 14) {
                        // 고수 프로필
                        WulinAvatarImageView(avatarName: getRegionNpcAvatar(for: activeRegion, isPast: isPastEra))
                            .frame(width: 60, height: 60)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(CaveTheme.gold, lineWidth: 1.5))
                            .shadow(color: .black, radius: 6)
                        
                        // 말풍선
                        VStack(alignment: .leading, spacing: 4) {
                            Text(activeRegion.npcName)
                                .font(.system(size: 11, weight: .bold, design: .serif))
                                .foregroundStyle(CaveTheme.gold)
                            
                            Text(npcMessage ?? activeRegion.npcLine)
                                .font(.system(size: 13, weight: .medium, design: .serif))
                                .foregroundStyle(.white)
                                .lineSpacing(3)
                                .transition(.opacity)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(Color.black.opacity(0.75))
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(CaveTheme.gold.opacity(0.2), lineWidth: 1)
                        )
                    }
                    .padding(.horizontal, 20)
                    .onTapGesture {
                        triggerNpcInteraction()
                    }
                }
                .padding(.bottom, 24)
                
                // 4. 하단 제어 바 (지도보기 버튼, 비무 버튼, 사운드 버튼)
                HStack(spacing: 12) {
                    // 강호천하도 전체지도 열기
                    Button(action: {
                        isShowingWorldMap = true
                        triggerHaptic(.medium)
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: "map.fill")
                            Text("강호천하도 (월드맵)")
                        }
                        .font(.system(size: 13, weight: .bold, design: .serif))
                        .foregroundStyle(Color.black)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                        .background(CaveTheme.gold)
                        .cornerRadius(10)
                    }
                    
                    // 환경음 제어
                    Button(action: {
                        let targetSound = themeSoundscapeKorean(for: activeRegion.themeSoundscape)
                        if store.selectedSoundscape == targetSound {
                            CaveSoundManager.shared.stop()
                            store.selectedSoundscape = "없음"
                            withAnimation {
                                npcMessage = "소음을 지워 정신을 맑게 가다듬소."
                            }
                        } else {
                            CaveSoundManager.shared.start(soundscape: targetSound)
                            store.selectedSoundscape = targetSound
                            withAnimation {
                                npcMessage = "강호의 한 자락 정취를 깨웠소."
                            }
                        }
                        triggerHaptic(.light)
                    }) {
                        let targetSound = themeSoundscapeKorean(for: activeRegion.themeSoundscape)
                        Image(systemName: store.selectedSoundscape == targetSound ? "speaker.wave.3.fill" : "speaker.slash.fill")
                            .font(.system(size: 15))
                            .foregroundStyle(.white)
                            .padding(.vertical, 12)
                            .frame(width: 50)
                            .background(Color.white.opacity(0.12))
                            .cornerRadius(10)
                    }
                    
                    // 무림 비무 (일일 1회 한정 추가 공력 획득)
                    let isCleared = store.clearedMapsToday.contains(activeRegion.name)
                    Button(action: {
                        performSparring(for: activeRegion)
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: isCleared ? "checkmark.shield" : "shield.fill")
                            Text(isCleared ? "완료" : "비무")
                        }
                        .font(.system(size: 13, weight: .bold, design: .serif))
                        .foregroundStyle(isCleared ? .white.opacity(0.3) : .white)
                        .padding(.vertical, 12)
                        .frame(width: 80)
                        .background(isCleared ? Color.white.opacity(0.08) : CaveTheme.jade)
                        .cornerRadius(10)
                    }
                    .disabled(isCleared)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
            .blur(radius: isLocked ? 8 : 0)
            .allowsHitTesting(!isLocked)
            
            // ── 비경 미개방 봉인 오버레이 (흐린 화면 위에 나타나는 안내판) ──
            if isLocked {
                Color.black.opacity(0.2)
                    .ignoresSafeArea()
                
                VStack(spacing: 12) {
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 26))
                        .foregroundStyle(CaveTheme.gold.opacity(0.9))
                    
                    Text("\(activeRegion.name) (封印)")
                        .font(.system(size: 16, weight: .bold, design: .serif))
                        .foregroundStyle(CaveTheme.gold)
                    
                    if activeRegion.isSecretRoute {
                        let cost = activeRegion.secretSectKey == "nanomachine" ? 200 : (activeRegion.secretSectKey == "wudang" ? 150 : (activeRegion.secretSectKey == "shaolin" ? 120 : 80))
                        let canUnlock = store.accumulatedGongryeokPoints >= cost
                        
                        Text("이곳의 결계를 해제하려면 진기(眞) \(cost)가 필요하오.\n(그대의 현재 진기: \(Int(store.accumulatedGongryeokPoints)) 眞)")
                            .font(.system(size: 12, design: .serif))
                            .foregroundStyle(.white.opacity(0.85))
                            .multilineTextAlignment(.center)
                            .lineSpacing(4)
                        
                        HStack(spacing: 12) {
                            Button(action: {
                                isShowingWorldMap = true
                                triggerHaptic(.light)
                            }) {
                                Text("지도 열기")
                                    .font(.system(size: 12, weight: .bold, design: .serif))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                    .background(Color.white.opacity(0.12))
                                    .cornerRadius(6)
                            }
                            
                            Button(action: {
                                handleSecretUnlockTrigger()
                            }) {
                                Text("결계 해제")
                                    .font(.system(size: 12, weight: .bold, design: .serif))
                                    .foregroundStyle(Color.black)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                    .background(canUnlock ? CaveTheme.gold : Color.gray.opacity(0.4))
                                    .cornerRadius(6)
                            }
                            .disabled(!canUnlock)
                        }
                        .padding(.top, 4)
                    } else {
                        Text("이 비경은 아직 연단할 수 없소. 총 수련 누적 공력 \(Int(activeRegion.requiredHours))시간이 필요하오.\n(그대의 현재 공력: \(String(format: "%.1f", store.totalStudySeconds / 3600.0))시간)")
                            .font(.system(size: 12, design: .serif))
                            .foregroundStyle(.white.opacity(0.85))
                            .multilineTextAlignment(.center)
                            .lineSpacing(4)
                        
                        Button(action: {
                            isShowingWorldMap = true
                            triggerHaptic(.light)
                        }) {
                            Text("강호천하도로 돌아가기")
                                .font(.system(size: 12, weight: .bold, design: .serif))
                                .foregroundStyle(Color.black)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .background(CaveTheme.gold)
                                .cornerRadius(6)
                        }
                        .padding(.top, 4)
                    }
                }
                .padding(20)
                .frame(width: 290)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color.black.opacity(0.45))
                        .background(Material.ultraThinMaterial)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(Color.white.opacity(0.15), lineWidth: 1)
                        )
                )
                .shadow(color: .black.opacity(0.4), radius: 15)
            }
            
            // ── 영약 제조 수련단 HUD 모달 오버레이 ──
            if isShowingElixirShop {
                Color.black.opacity(0.65)
                    .ignoresSafeArea()
                    .onTapGesture {
                        isShowingElixirShop = false
                    }
                
                VStack(spacing: 16) {
                    HStack {
                        Image(systemName: "pills.fill")
                            .foregroundStyle(CaveTheme.gold)
                        Text("단약정실 (丹藥鼎室)")
                            .font(.system(size: 18, weight: .bold, design: .serif))
                            .foregroundStyle(.white)
                        Spacer()
                        Button(action: {
                            isShowingElixirShop = false
                        }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.white.opacity(0.5))
                        }
                    }
                    
                    Text("수련으로 모은 진기(眞)를 소모하여 공력 획득량을 가속하는 소환단 또는 대환단을 연단할 수 있소.")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.65))
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    
                    Divider().background(Color.white.opacity(0.12))
                    
                    // 나의 진기 잔액
                    HStack {
                        Text("보유 중인 수련 진기:")
                            .font(.system(size: 13))
                            .foregroundStyle(.white.opacity(0.6))
                        Spacer()
                        Text("\(Int(store.accumulatedGongryeokPoints)) 眞")
                            .font(.system(size: 16, weight: .bold, design: .serif))
                            .foregroundStyle(CaveTheme.gold)
                    }
                    
                    // 버프 적용 중 정보
                    if store.activeBuffRemainingSeconds > 0 {
                        HStack {
                            Text("현재 효력:")
                                .font(.system(size: 12))
                                .foregroundStyle(CaveTheme.gold)
                            Spacer()
                            Text("공력 수확 \(Int(store.gongryeokMultiplier * 10) / 10)배 가속 (남은시간: \(Int(store.activeBuffRemainingSeconds / 60))분)")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(CaveTheme.gold)
                        }
                        .padding(8)
                        .background(CaveTheme.gold.opacity(0.1))
                        .cornerRadius(6)
                    }
                    
                    // 1. 소환단
                    Button(action: {
                        buyElixir(buffSeconds: 900, multiplier: 1.5, cost: 10)
                    }) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("소환단 (小還丹)")
                                    .font(.system(size: 14, weight: .bold))
                                Text("15분간 공력 획득량 1.5배 가속")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.5))
                            }
                            Spacer()
                            Text("10 眞 소모")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(CaveTheme.gold)
                        }
                        .padding(.vertical, 10)
                        .padding(.horizontal, 14)
                        .background(Color.white.opacity(0.08))
                        .cornerRadius(8)
                    }
                    
                    // 2. 대환단
                    Button(action: {
                        buyElixir(buffSeconds: 3600, multiplier: 2.0, cost: 30)
                    }) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("대환단 (大還丹)")
                                    .font(.system(size: 14, weight: .bold))
                                Text("1시간 동안 공력 획득량 2.0배 가속")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.5))
                            }
                            Spacer()
                            Text("30 眞 소모")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(CaveTheme.gold)
                        }
                        .padding(.vertical, 10)
                        .padding(.horizontal, 14)
                        .background(Color.white.opacity(0.08))
                        .cornerRadius(8)
                    }
                }
                .padding(20)
                .background(Color(white: 0.15))
                .cornerRadius(16)
                .frame(width: 300)
                .shadow(color: .black, radius: 20)
            }
            
            // ── 비무 결과 대결창 오버레이 ──
            if isShowingSparringResult {
                ZStack {
                    Color.black.opacity(0.8)
                        .ignoresSafeArea()
                    
                    VStack(spacing: 18) {
                        Text(sparringSuccess ? "⚔️ 比武 勝利 (비무 승리)!" : "⚔️ 比武 敗北 (비무 패배)...")
                            .font(.system(size: 20, weight: .black, design: .serif))
                            .foregroundStyle(sparringSuccess ? CaveTheme.gold : .red)
                        
                        Text(sparringLog)
                            .font(.system(size: 13, weight: .medium, design: .serif))
                            .foregroundStyle(.white.opacity(0.8))
                            .lineSpacing(6)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 4)
                        
                        Button(action: {
                            withAnimation {
                                isShowingSparringResult = false
                            }
                        }) {
                            Text("비무 대결 종료")
                                .font(.system(size: 13, weight: .bold, design: .serif))
                                .foregroundStyle(Color.black)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 10)
                                .background(CaveTheme.gold)
                                .cornerRadius(8)
                        }
                    }
                    .padding(24)
                    .background(Color(white: 0.12))
                    .cornerRadius(16)
                    .frame(width: 290)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(sparringSuccess ? CaveTheme.gold.opacity(0.4) : Color.red.opacity(0.4), lineWidth: 1.5)
                    )
                    .shadow(color: .black, radius: 30)
                }
                .transition(.opacity)
            }
            
            // ── 강호천하도 (월드맵) 전체화면 오버레이 ──
            if isShowingWorldMap {
                WulinWorldMapView(
                    regions: regions,
                    unlockedFlags: regions.indices.map { checkUnlocked(index: $0) },
                    activeMapIndex: $activeMapIndex,
                    isShowingWorldMap: $isShowingWorldMap,
                    npcMessage: $npcMessage,
                    isPastEra: $isPastEra,
                    onSelectRegion: { idx in
                        if idx >= 0 {
                            withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) {
                                activeMapIndex = idx
                                npcMessage = nil
                                isShowingWorldMap = false
                            }
                            triggerHaptic(.rigid)
                        } else {
                            // 잠금 해제 비용 지불 팝업 트리거
                            if idx < 0 {
                                handleSecretUnlockTrigger()
                            }
                        }
                    },
                    onClose: {
                        withAnimation(.spring(response: 0.45, dampingFraction: 0.75)) {
                            isShowingWorldMap = false
                        }
                        triggerHaptic(.light)
                    }
                )
            }
        }
        .onAppear {
            setupJingiParticles()
            startParticleAnimation()
            store.checkDailyReset()
        }
        .onDisappear {
            particleTimer?.invalidate()
            particleTimer = nil
        }
        .onChange(of: activeMapIndex) { _ in
            setupJingiParticles()
        }
        .onChange(of: isPastEra) { _ in
            setupJingiParticles()
        }
    }
    
    // ── 비경 잠금 해제 검증 ──
    private func checkUnlocked(index: Int) -> Bool {
        if store.isDevAllMapsUnlocked {
            return true
        }
        let reg = regions[index]
        if let key = reg.secretSectKey {
            if key == "wudang" {
                return store.isWudangUnlocked
            } else if key == "shaolin" {
                return store.isShaolinUnlocked
            } else if key == "hwasan" {
                return store.isHwasanSecretUnlocked
            } else if key == "nanomachine" {
                return store.isNanomachineUnlocked
            }
            return false
        } else {
            return (store.totalStudySeconds / 3600.0) >= reg.requiredHours
        }
    }
    
    // ── 잠긴 비경 터치 시 진기 소모 구매 ──
    private func handleSecretUnlockTrigger() {
        var targetIndex = -1
        for idx in regions.indices {
            if regions[idx].isSecretRoute && !checkUnlocked(index: idx) {
                targetIndex = idx
                break
            }
        }
        
        guard targetIndex >= 0 else {
            triggerNotificationFeedback(.error)
            withAnimation {
                npcMessage = "이곳은 공력이 부족하여 아직 범접할 수 없소."
            }
            return
        }
        
        let reg = regions[targetIndex]
        let cost = reg.secretSectKey == "nanomachine" ? 200 : (reg.secretSectKey == "wudang" ? 150 : (reg.secretSectKey == "shaolin" ? 120 : 80))
        
        if store.accumulatedGongryeokPoints >= cost {
            store.accumulatedGongryeokPoints -= cost
            if reg.secretSectKey == "wudang" {
                store.isWudangUnlocked = true
            } else if reg.secretSectKey == "shaolin" {
                store.isShaolinUnlocked = true
            } else if reg.secretSectKey == "hwasan" {
                store.isHwasanSecretUnlocked = true
            } else if reg.secretSectKey == "nanomachine" {
                store.isNanomachineUnlocked = true
            }
            store.persist()
            triggerNotificationFeedback(.success)
            withAnimation {
                activeMapIndex = targetIndex
                npcMessage = "\(reg.name)의 봉인을 해제했소! 비경을 연단할 수 있소."
            }
        } else {
            triggerNotificationFeedback(.error)
            withAnimation {
                npcMessage = "\(reg.name) 비경을 개방하려면 진기가 부족하오. (필요: \(cost) 眞)"
            }
        }
    }
    
    // ── 영약 제조 기능 구현 ──
    private func buyElixir(buffSeconds: TimeInterval, multiplier: Double, cost: Int) {
        if store.accumulatedGongryeokPoints >= cost {
            store.accumulatedGongryeokPoints -= cost
            store.activeBuffRemainingSeconds = buffSeconds
            store.gongryeokMultiplier = multiplier
            store.persist()
            
            isShowingElixirShop = false
            triggerNotificationFeedback(.success)
            withAnimation {
                npcMessage = "영약의 기운이 몸 전체에 퍼져 공력 획득 배율이 \(multiplier)배가 되었소!"
            }
        } else {
            triggerNotificationFeedback(.error)
            withAnimation {
                npcMessage = "진기가 부족하여 영약을 조제할 수 없소. (필요: \(cost) 眞)"
            }
        }
    }
    
    // ── 무림 비무 로직 시뮬레이션 ──
    private func performSparring(for region: MapRegion) {
        triggerHaptic(.rigid)
        
        let userLevel = store.totalStudySeconds / 3600.0
        let winProbability = min(max(0.3 + (userLevel - region.requiredHours) * 0.1, 0.2), 0.95)
        let randVal = Double.random(in: 0...1)
        
        let success = randVal < winProbability
        sparringSuccess = success
        
        let reward = success ? Int(Double(15) * (region.requiredHours + 1.0)) : 2
        
        if success {
            store.accumulatedGongryeokPoints += reward
            if !store.clearedMapsToday.contains(region.name) {
                store.clearedMapsToday.append(region.name)
            }
            store.persist()
            triggerNotificationFeedback(.success)
            
            sparringLog = """
            [무림 첩보] \(region.name)의 고수 \(region.npcName)와 비무를 가졌소!
            검화가 사방에 불꽃을 튕기며 격돌하는 찰나, 자네의 초집중 공력이 승기를 안겼소.
            
            수련 진기 +\(reward) 眞 (획득 완료)
            """
        } else {
            triggerNotificationFeedback(.error)
            sparringLog = """
            [무림 첩보] \(region.name)의 고수 \(region.npcName)와 비무를 가졌소!
            공세는 매서웠으나 집중력의 흐트러짐이 틈을 주어 패하고 말았구려.
            
            진기 +\(reward) 眞 (참가 보상)
            """
            store.accumulatedGongryeokPoints += reward
            store.persist()
        }
        
        withAnimation {
            isShowingSparringResult = true
        }
    }
    
    // ── NPC 대화 터치 시 햅틱 및 대사 리플레시 ──
    private func triggerNpcInteraction() {
        triggerHaptic(.light)
        let lines = [
            "정신일도 하사불성이라, 무도가의 집중은 세상을 바꾸는 법이외다.",
            "진기를 한 방울 모으는 것조차 우주의 호흡을 훔치는 행위와도 같소.",
            "수련을 멈추지 마시오. 한 순간의 주저함이 칼날을 녹슬게 하오.",
            "비경에 흐르는 신비한 영약의 정수를 느껴보시오."
        ]
        withAnimation {
            npcMessage = lines.randomElement()
        }
    }
    
    // ── 각 구역별 특색 맞춤형 이팩트 매핑 ──
    private func getEffectType(for regionName: String) -> ParticleEffectType {
        switch regionName {
        case "화산파 (華山派)", "화산파 비경 (화산귀환)":
            return .plumBlossom
        case "무당파 (武당파)", "무당파 (武當派)", "무당파 비경 (태극동천)":
            return .yinYang
        case "천마신교 (天魔神敎)", "마교 백화전 (나노마신)":
            return .demonicMist
        case "녹림채 (綠林寨)":
            return .fireSparks
        case "개방 지부 (괴력난신)":
            return .bambooLeaves
        case "청성파 (靑城派)":
            return .lightning
        case "무명의 오두막":
            return .hermitFog
        case "무림맹 (武림맹)", "무림맹 (武林盟)":
            return .swordQi
        default:
            return .jingi
        }
    }

    // ── 진기 파티클 시뮬레이터 ──
    private func setupJingiParticles() {
        let region = activeRegion
        let type = getEffectType(for: region.name)
        
        var particles: [JingiParticle] = []
        let count = (type == .hermitFog) ? 15 : 35
        
        for _ in 0..<count {
            var color: Color = .yellow
            var speed: CGFloat = 0.003
            var size: CGFloat = 4.0
            
            switch type {
            case .jingi:
                color = CaveTheme.gold
                speed = CGFloat.random(in: 0.003...0.009)
                size = CGFloat.random(in: 3...7)
            case .yinYang:
                color = Bool.random() ? .white : Color(white: 0.25)
                speed = CGFloat.random(in: 0.002...0.005)
                size = CGFloat.random(in: 8...15)
            case .plumBlossom:
                color = Color(red: 1.0, green: 0.45, blue: 0.65)
                speed = CGFloat.random(in: 0.004...0.010)
                size = CGFloat.random(in: 6...12)
            case .demonicMist:
                color = Bool.random() ? Color(red: 0.6, green: 0.1, blue: 0.8) : Color(red: 0.3, green: 0.0, blue: 0.5)
                speed = CGFloat.random(in: 0.005...0.012)
                size = CGFloat.random(in: 5...9)
            case .fireSparks:
                color = Bool.random() ? Color(red: 1.0, green: 0.4, blue: 0.1) : Color(red: 1.0, green: 0.2, blue: 0.0)
                speed = CGFloat.random(in: 0.004...0.010)
                size = CGFloat.random(in: 3...6)
            case .bambooLeaves:
                color = Color(red: 0.15, green: 0.55, blue: 0.2)
                speed = CGFloat.random(in: 0.003...0.007)
                size = CGFloat.random(in: 8...14)
            case .lightning:
                color = Color(red: 0.2, green: 0.85, blue: 1.0)
                speed = CGFloat.random(in: 0.008...0.02)
                size = CGFloat.random(in: 4...8)
            case .hermitFog:
                color = Color(white: 0.9)
                speed = CGFloat.random(in: 0.001...0.003)
                size = CGFloat.random(in: 40...70)
            case .swordQi:
                color = Bool.random() ? Color(red: 0.8, green: 0.95, blue: 1.0) : CaveTheme.gold
                speed = CGFloat.random(in: 0.012...0.025)
                size = CGFloat.random(in: 5...12)
            }
            
            particles.append(
                JingiParticle(
                    x: CGFloat.random(in: 0...1),
                    y: CGFloat.random(in: 0.0...1.0),
                    size: size,
                    opacity: Double.random(in: 0.2...0.75),
                    speed: speed,
                    rotation: Double.random(in: 0...360),
                    drift: CGFloat.random(in: -0.003...0.003),
                    color: color,
                    effectType: type
                )
            )
        }
        jingiParticles = particles
    }
    
    private func startParticleAnimation() {
        particleTimer = Timer.scheduledTimer(withTimeInterval: 0.04, repeats: true) { _ in
            Task { @MainActor in
                guard !isShowingWorldMap else { return }
                for i in 0..<jingiParticles.count {
                    let type = jingiParticles[i].effectType
                    
                    switch type {
                    case .jingi:
                        jingiParticles[i].y -= jingiParticles[i].speed
                        jingiParticles[i].x += CGFloat.random(in: -0.004...0.004)
                        if jingiParticles[i].y < 0 {
                            jingiParticles[i].y = CGFloat.random(in: 0.95...1.0)
                            jingiParticles[i].x = CGFloat.random(in: 0...1)
                        }
                        
                    case .yinYang:
                        jingiParticles[i].y -= jingiParticles[i].speed
                        jingiParticles[i].x += sin(jingiParticles[i].y * 8.0 + CGFloat(i)) * 0.005
                        if jingiParticles[i].y < 0 {
                            jingiParticles[i].y = CGFloat.random(in: 0.95...1.0)
                            jingiParticles[i].x = CGFloat.random(in: 0...1)
                        }
                        
                    case .plumBlossom:
                        jingiParticles[i].y += jingiParticles[i].speed
                        jingiParticles[i].x += cos(jingiParticles[i].y * 6.0 + CGFloat(i)) * 0.006
                        jingiParticles[i].rotation += 1.8
                        if jingiParticles[i].y > 1.0 {
                            jingiParticles[i].y = CGFloat.random(in: 0.0...0.05)
                            jingiParticles[i].x = CGFloat.random(in: 0...1)
                        }
                        
                    case .demonicMist:
                        jingiParticles[i].y -= jingiParticles[i].speed
                        jingiParticles[i].x += CGFloat.random(in: -0.008...0.008)
                        jingiParticles[i].opacity = Double.random(in: 0.15...0.7)
                        if jingiParticles[i].y < 0 {
                            jingiParticles[i].y = CGFloat.random(in: 0.95...1.0)
                            jingiParticles[i].x = CGFloat.random(in: 0.1...0.9)
                        }
                        
                    case .fireSparks:
                        jingiParticles[i].y -= jingiParticles[i].speed * 1.2
                        jingiParticles[i].x += jingiParticles[i].drift
                        jingiParticles[i].opacity -= 0.008
                        if jingiParticles[i].opacity <= 0 || jingiParticles[i].y < 0 {
                            jingiParticles[i].y = CGFloat.random(in: 0.95...1.0)
                            jingiParticles[i].x = CGFloat.random(in: 0...1)
                            jingiParticles[i].opacity = Double.random(in: 0.5...0.85)
                        }
                        
                    case .bambooLeaves:
                        jingiParticles[i].y += jingiParticles[i].speed
                        jingiParticles[i].x += sin(jingiParticles[i].y * 4.0 + CGFloat(i)) * 0.008
                        jingiParticles[i].rotation += 1.2
                        if jingiParticles[i].y > 1.0 {
                            jingiParticles[i].y = CGFloat.random(in: 0.0...0.05)
                            jingiParticles[i].x = CGFloat.random(in: 0...1)
                        }
                        
                    case .lightning:
                        jingiParticles[i].rotation += 15
                        if Double.random(in: 0...1) > 0.85 {
                            jingiParticles[i].x = CGFloat.random(in: 0.05...0.95)
                            jingiParticles[i].y = CGFloat.random(in: 0.05...0.95)
                            jingiParticles[i].opacity = Double.random(in: 0.4...0.9)
                        }
                        
                    case .hermitFog:
                        jingiParticles[i].x += jingiParticles[i].speed
                        jingiParticles[i].y += sin(jingiParticles[i].x * 5.0 + CGFloat(i)) * 0.001
                        if jingiParticles[i].x > 1.2 {
                            jingiParticles[i].x = -0.2
                            jingiParticles[i].y = CGFloat.random(in: 0.2...0.8)
                        }
                        
                    case .swordQi:
                        jingiParticles[i].y += jingiParticles[i].speed
                        if jingiParticles[i].y > 1.0 {
                            jingiParticles[i].y = CGFloat.random(in: 0.0...0.05)
                            jingiParticles[i].x = CGFloat.random(in: 0...1)
                        }
                    }
                }
            }
        }
    }
    
    private func triggerHaptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.prepare()
        generator.impactOccurred()
    }
    
    private func triggerNotificationFeedback(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(type)
    }
}

// ── 이미지 메모리 NSCache 캐싱 엔진 ──
class WulinImageCache {
    nonisolated(unsafe) static let shared = NSCache<NSString, UIImage>()
    
    static func get(filename: String) -> UIImage? {
        return shared.object(forKey: filename as NSString)
    }
    
    static func set(filename: String, image: UIImage) {
        shared.setObject(image, forKey: filename as NSString)
    }
}

// ── 로컬 이미지 안전 로더 ──
struct WulinImageView: View {
    let filename: String
    var contentMode: ContentMode = .fill
    
    var body: some View {
        if let uiImage = loadLocalImage(filename: filename) {
            let img = Image(uiImage: uiImage)
                .resizable()
                .aspectRatio(contentMode: contentMode)
            if contentMode == .fill {
                img.ignoresSafeArea()
            } else {
                img
            }
        } else {
            Color.clear
        }
    }
    
    private func loadLocalImage(filename: String) -> UIImage? {
        // 1. 메모리 캐시 확인
        if let cached = WulinImageCache.get(filename: filename) {
            return cached
        }
        
        // 2. 에셋 카탈로그 컴파일 이미지 확인
        let cleanName = (filename as NSString).deletingPathExtension
        if let image = UIImage(named: cleanName) {
            WulinImageCache.set(filename: filename, image: image)
            return image
        }
        
        let nameOnly = (filename as NSString).deletingPathExtension
        let extOnly = (filename as NSString).pathExtension
        
        var loadedImage: UIImage? = nil
        
        if let bundleURL = Bundle.main.url(forResource: nameOnly, withExtension: extOnly),
           let data = try? Data(contentsOf: bundleURL) {
            loadedImage = UIImage(data: data)
        } else {
            let localPath = "/Users/juns/code/work/blackLAB/apps/FocusGuard/FocusGuard/\(filename)"
            if FileManager.default.fileExists(atPath: localPath),
               let data = try? Data(contentsOf: URL(fileURLWithPath: localPath)) {
                loadedImage = UIImage(data: data)
            } else {
                let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                let destinationURL = documentsURL.appendingPathComponent(filename)
                if let data = try? Data(contentsOf: destinationURL) {
                    loadedImage = UIImage(data: data)
                }
            }
        }
        
        // 2. 캐시에 저장 후 리턴
        if let img = loadedImage {
            WulinImageCache.set(filename: filename, image: img)
        }
        return loadedImage
    }
}

// ── NPC 아바타 이미지 안전 로더 ──
struct WulinAvatarImageView: View {
    let avatarName: String
    
    var body: some View {
        let nameOnly = (avatarName as NSString).deletingPathExtension
        if let uiImage = loadLocalImage(filename: avatarName) {
            Image(uiImage: uiImage)
                .resizable()
        } else if let assetImage = UIImage(named: nameOnly) {
            Image(uiImage: assetImage)
                .resizable()
        } else if let assetImageDirect = UIImage(named: avatarName) {
            Image(uiImage: assetImageDirect)
                .resizable()
        } else {
            Image(systemName: "person.circle.fill")
                .resizable()
                .foregroundStyle(CaveTheme.gold)
        }
    }
    
    private func loadLocalImage(filename: String) -> UIImage? {
        if let cached = WulinImageCache.get(filename: filename) {
            return cached
        }
        
        let nameOnly = (filename as NSString).deletingPathExtension
        if let assetImage = UIImage(named: nameOnly) {
            WulinImageCache.set(filename: filename, image: assetImage)
            return assetImage
        }
        if let assetImageDirect = UIImage(named: filename) {
            WulinImageCache.set(filename: filename, image: assetImageDirect)
            return assetImageDirect
        }
        
        let extOnly = (filename as NSString).pathExtension
        var loadedImage: UIImage? = nil
        
        if let bundleURL = Bundle.main.url(forResource: nameOnly, withExtension: extOnly),
           let data = try? Data(contentsOf: bundleURL) {
            loadedImage = UIImage(data: data)
        } else {
            let localPath = "/Users/juns/code/work/blackLAB/apps/FocusGuard/FocusGuard/\(filename)"
            if FileManager.default.fileExists(atPath: localPath),
               let data = try? Data(contentsOf: URL(fileURLWithPath: localPath)) {
                loadedImage = UIImage(data: data)
            }
        }
        
        if let img = loadedImage {
            WulinImageCache.set(filename: filename, image: img)
        }
        return loadedImage
    }
}

// ── 강호천하도 월드맵 내부 경로 그리기 ──
struct WulinMapPathsView: View {
    let regions: [MapRegion]
    let w: CGFloat
    let h: CGFloat
    
    var body: some View {
        Path { path in
            let connections = [
                (0, 2), (0, 1), (2, 3), (3, 4), (4, 5), (5, 6),
                (6, 7), (7, 8), (8, 9), (5, 10), (9, 11), (6, 12)
            ]
            for conn in connections {
                let start = regions[conn.0]
                let end = regions[conn.1]
                path.move(to: CGPoint(x: CGFloat(start.mapX) * w, y: CGFloat(start.mapY) * h))
                path.addLine(to: CGPoint(x: CGFloat(end.mapX) * w, y: CGFloat(end.mapY) * h))
            }
        }
        .stroke(
            CaveTheme.gold.opacity(0.35),
            style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [4, 4])
        )
    }
}

// ── 강호천하도 (월드맵) 전체화면 오버레이 구조체 ──
struct WulinWorldMapView: View {
    let regions: [MapRegion]
    let unlockedFlags: [Bool]
    @Binding var activeMapIndex: Int
    @Binding var isShowingWorldMap: Bool
    @Binding var npcMessage: String?
    @Binding var isPastEra: Bool // 시대 전환 연동
    let onSelectRegion: (Int) -> Void
    let onClose: () -> Void
    
    var body: some View {
        ZStack {
            // 어두운 배경색
            Color.black.ignoresSafeArea()
            
            // ── 중단 영역: 지도 및 핀 매핑 (풀 스크린 스크롤뷰) ──
            ScrollView([.horizontal, .vertical], showsIndicators: false) {
                ZStack {
                    WulinImageView(
                        filename: isPastEra ? "past_wulin_world_map_new_1783229031585.jpg" : "wulin_world_map_1783227531825.jpg",
                        contentMode: .fit
                    )
                    .frame(height: 720)
                    .aspectRatio(isPastEra ? 1.49 : 0.558, contentMode: .fit)
                    .overlay(
                        GeometryReader { geo in
                            let w = geo.size.width
                            let h = geo.size.height
                            
                            ZStack {
                                WulinMapPathsView(regions: regions, w: w, h: h)
                                
                                SwiftUI.ForEach(0..<regions.count, id: \.self) { idx in
                                    let reg = regions[idx]
                                    let unlocked = unlockedFlags[idx]
                                    let isCurrent = (activeMapIndex == idx)
                                    
                                    Button(action: {
                                        onSelectRegion(idx)
                                    }) {
                                        ZStack {
                                            if isCurrent {
                                                Circle()
                                                    .stroke(CaveTheme.gold, lineWidth: 2.5)
                                                    .frame(width: 28, height: 28)
                                                    .scaleEffect(isShowingWorldMap ? 1.35 : 1.0)
                                                    .opacity(isShowingWorldMap ? 0.0 : 0.8)
                                                    .animation(
                                                        .easeInOut(duration: 1.2).repeatForever(autoreverses: false),
                                                        value: isShowingWorldMap
                                                    )
                                            }
                                            
                                            Circle()
                                                .fill(isCurrent ? CaveTheme.gold : (unlocked ? CaveTheme.jade : Color.black.opacity(0.75)))
                                                .frame(width: 18, height: 18)
                                                .shadow(color: isCurrent ? CaveTheme.gold : .black, radius: 4)
                                                .overlay(
                                                    Circle()
                                                        .stroke(unlocked ? .white.opacity(0.9) : .gray.opacity(0.6), lineWidth: 1.2)
                                                )
                                            
                                            if !unlocked {
                                                Image(systemName: "lock.fill")
                                                    .font(.system(size: 8))
                                                    .foregroundStyle(.white)
                                            } else if reg.isSecretRoute {
                                                Image(systemName: "sparkles")
                                                    .font(.system(size: 8))
                                                    .foregroundStyle(CaveTheme.gold)
                                            }
                                        }
                                    }
                                    .buttonStyle(.plain)
                                    .position(x: CGFloat(reg.mapX) * w, y: CGFloat(reg.mapY) * h)
                                }
                            }
                        }
                    )
                }
            }
            .ignoresSafeArea()
            
            // 지도 외곽 어두운 프레임 효과
            RadialGradient(
                gradient: Gradient(colors: [.clear, .black.opacity(0.15), .black.opacity(0.65)]),
                center: .center,
                startRadius: 200,
                endRadius: 460
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)
            
            // ── 상단 영역: 플로팅 시대 전환 토글 헤더 ──
            VStack {
                VStack(spacing: 4) {
                    Text(isPastEra ? "강호천하도 · 과거 시점 (過去 江湖)" : "강호천하도 · 현재 시점 (現在 江湖)")
                        .font(.system(size: 15, weight: .bold, design: .serif))
                        .foregroundStyle(CaveTheme.gold)
                        .shadow(color: .black, radius: 3)
                    
                    Button(action: {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                            isPastEra.toggle()
                        }
                        triggerNotificationFeedback(.success)
                    }) {
                        HStack(spacing: 5) {
                            Image(systemName: "clock.arrow.circlepath")
                            Text(isPastEra ? "현재로 회귀 (現在)" : "과거로 전환 (過去)")
                        }
                        .font(.system(size: 10, weight: .bold, design: .serif))
                        .foregroundStyle(Color.black)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(CaveTheme.gold)
                        .cornerRadius(6)
                    }
                }
                .padding(.top, 50)
                Spacer()
            }
            .allowsHitTesting(true)
            
            // ── 하단 영역: 플로팅 안내문 및 닫기 버튼 ──
            VStack {
                Spacer()
                HStack(alignment: .bottom) {
                    // 지도 닫기 버튼
                    Button(action: {
                        onClose()
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "xmark.circle.fill")
                            Text("지도 닫기")
                                .font(.system(size: 11, weight: .bold, design: .serif))
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.black.opacity(0.8))
                        .foregroundStyle(CaveTheme.gold)
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(CaveTheme.gold.opacity(0.3), lineWidth: 1)
                        )
                    }
                    .padding(.leading, 20)
                    
                    Spacer()
                    
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("💡 비경 터치 시 수련 거처 결정")
                            .font(.system(size: 10, weight: .semibold, design: .serif))
                            .foregroundStyle(CaveTheme.gold.opacity(0.85))
                        Text("잠긴 비경 터치 시 봉인 정보 고찰")
                            .font(.system(size: 9, design: .serif))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                    .padding(.trailing, 20)
                }
                .padding(.bottom, 30)
            }
        }
    }
    
    private func triggerNotificationFeedback(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(type)
    }
}
