import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeIOSStyleOnboardingViewProps: UIBaseViewProps {
  @Field var tint: Color = .blue
  @Field var hideBezels: Bool = false
  @Field var initialName: String = ""
  @Field var profileImageDataUri: String = ""
  var onComplete = EventDispatcher()
  var onNameChange = EventDispatcher()
  var onProfileImagePress = EventDispatcher()
}

public struct NativeIOSStyleOnboardingView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeIOSStyleOnboardingViewProps

  public init(props: NativeIOSStyleOnboardingViewProps) {
    self.props = props
  }

  public var body: some View {
#if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      IOS26StyleOnBoarding(
        tint: props.tint,
        hideBezels: props.hideBezels,
        items: ios26OnboardingItems,
        initialName: props.initialName,
        profileImageDataUri: props.profileImageDataUri,
        onNameChange: { name in
          props.onNameChange(["name": name])
        },
        onProfileImagePress: {
          props.onProfileImagePress([:])
        }
      ) {
        props.onComplete([:])
      }
    } else {
      IOSStyleOnboardingFallback(onComplete: {
        props.onComplete([:])
      })
    }
#else
    IOSStyleOnboardingFallback(onComplete: {
      props.onComplete([:])
    })
#endif
  }

  @available(iOS 26.0, *)
  private var ios26OnboardingItems: [IOS26StyleOnBoarding.Item] {
    [
      .init(
        id: 0,
        title: "Welcome to iOS 26",
        subtitle: "Introducing a new design with\nLiquid Glass.",
        screenshot: UIImage(named: "Screen1")
      ),
      .init(
        id: 1,
        title: "New Context Menu's",
        subtitle: "Access menu options with\ncontrols that fluidly morph.",
        screenshot: UIImage(named: "Screen2")
      ),
      .init(
        id: 2,
        title: "Floating Tab Bar",
        subtitle: "Tab bar that floats and responds\nto your hand's motion.",
        screenshot: UIImage(named: "Screen4"),
        zoomScale: 1.3,
        zoomAnchor: .init(x: 0.5, y: 1.1)
      ),
      .init(
        id: 3,
        title: "All New Photo's App",
        subtitle: "Focus on what matters with\nLiquid Glass Controls.",
        screenshot: UIImage(named: "Screen3"),
        zoomScale: 1.3,
        zoomAnchor: .init(x: 0.5, y: -0.3)
      ),
      .init(
        id: 4,
        title: "Personalized Home Screen",
        subtitle: "Personalize iPhone with new\nlooks for app icons.",
        screenshot: UIImage(named: "Screen5")
      ),
      .init(
        id: 5,
        title: "What is your name?",
        subtitle: "",
        screenshot: nil,
        isProfilePage: true
      ),
      .init(
        id: 6,
        title: "",
        subtitle: "",
        screenshot: nil,
        isIncomePage: true
      ),
      .init(
        id: 7,
        title: "",
        subtitle: "",
        screenshot: nil,
        isBudgetCategoriesPage: true
      )
    ]
  }
}

#if compiler(>=6.2)
@available(iOS 26.0, *)
private struct IOS26StyleOnBoarding: View {
  var tint: Color = .blue
  var hideBezels: Bool = false
  var items: [Item]
  var profileImageDataUri: String
  var onNameChange: (String) -> Void
  var onProfileImagePress: () -> Void
  var onComplete: () -> Void

  @State private var currentIndex: Int = 0
  @State private var screenshotSize: CGSize = .zero
  @State private var name: String
  @State private var keyboardHeight: CGFloat = 0
  @State private var keyboardDismissCoverVisible: Bool = false

  init(
    tint: Color = .blue,
    hideBezels: Bool = false,
    items: [Item],
    initialName: String,
    profileImageDataUri: String,
    onNameChange: @escaping (String) -> Void,
    onProfileImagePress: @escaping () -> Void,
    onComplete: @escaping () -> Void
  ) {
    self.tint = tint
    self.hideBezels = hideBezels
    self.items = items
    self.profileImageDataUri = profileImageDataUri
    self.onNameChange = onNameChange
    self.onProfileImagePress = onProfileImagePress
    self.onComplete = onComplete
    self._name = State(initialValue: initialName)
  }

  var body: some View {
    ZStack(alignment: .bottom) {
      Color(uiColor: .systemBackground)
        .ignoresSafeArea()

      let isProfilePage = items[currentIndex].isProfilePage
      let isIncomePage = items[currentIndex].isIncomePage
      let isBudgetCategoriesPage = items[currentIndex].isBudgetCategoriesPage
      let usesCompactControls = isProfilePage || isIncomePage || isBudgetCategoriesPage
      let keyboardLift = isProfilePage ? max(keyboardHeight - 10, 0) : 0

      if isProfilePage {
        ProfileNamePageView(
          name: $name,
          profileImageDataUri: profileImageDataUri,
          animation: animation,
          onProfileImagePress: onProfileImagePress
        )
        .offset(y: -keyboardLift)
        .onChange(of: name) { newValue in
          onNameChange(newValue)
        }
      } else if isIncomePage {
        IncomeSetupPageView()
          .padding(.bottom, 112)
      } else if isBudgetCategoriesPage {
        BudgetCategoriesPageView()
          .padding(.bottom, 112)
      } else {
        ScreenshotView()
          .compositingGroup()
          .scaleEffect(
            items[currentIndex].zoomScale,
            anchor: items[currentIndex].zoomAnchor
          )
          .padding(.top, 35)
          .padding(.horizontal, 30)
          .padding(.bottom, 220)
      }

      VStack(spacing: usesCompactControls ? 0 : 10) {
        TextContentView()
          .frame(height: usesCompactControls ? 0.001 : 84)
          .opacity(usesCompactControls ? 0 : 1)
          .clipped()

        VStack(spacing: 10) {
          IndicatorView()
          ContinueButton()
        }
      }
      .padding(.top, usesCompactControls ? 0 : 20)
      .padding(.horizontal, 15)
      .frame(height: usesCompactControls ? 76 : 210, alignment: .bottom)
      .background {
        VariableGlassBlur(15)
      }
      .padding(.bottom, isProfilePage && keyboardHeight > 0 ? 4 : 0)
      .offset(y: -keyboardLift)

      BackButton()

      if keyboardDismissCoverVisible {
        Color.clear
          .contentShape(Rectangle())
          .ignoresSafeArea()
          .onTapGesture {
            dismissKeyboard()
          }
          .zIndex(10)
      }
    }
    .ignoresSafeArea(.keyboard, edges: .all)
    .preferredColorScheme(.light)
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { output in
      if let info = output.userInfo,
         let frame = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue {
        keyboardHeight = frame.height
        keyboardDismissCoverVisible = true
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
      keyboardHeight = 0
      keyboardDismissCoverVisible = false
    }
    .animation(.spring(response: 0.5, dampingFraction: 0.8, blendDuration: 0), value: keyboardHeight)
  }

  @ViewBuilder
  func ScreenshotView() -> some View {
    let shape = ConcentricRectangle(
      topLeadingCorner: .concentric(minimum: nil),
      topTrailingCorner: .concentric(minimum: nil),
      bottomLeadingCorner: .concentric(minimum: nil),
      bottomTrailingCorner: .concentric(minimum: nil)
    )

    GeometryReader {
      let size = $0.size

      Rectangle()
        .fill(Color(uiColor: .systemBackground))

      ScrollView(.horizontal) {
        HStack(spacing: 12) {
          ForEach(items.indices, id: \.self) { index in
            let item = items[index]

            Group {
              if let screenshot = item.screenshot {
                Image(uiImage: screenshot)
                  .resizable()
                  .aspectRatio(contentMode: .fit)
                  .onGeometryChange(for: CGSize.self) {
                    $0.size
                  } action: { newValue in
                    guard index == 0 && screenshotSize == .zero else { return }
                    screenshotSize = newValue
                  }
                  .clipShape(shape)
              } else {
                Rectangle()
                  .fill(.black)
              }
            }
            .frame(width: size.width, height: size.height)
          }
        }
        .scrollTargetLayout()
      }
      .scrollDisabled(true)
      .scrollTargetBehavior(.viewAligned)
      .scrollIndicators(.hidden)
      .scrollPosition(id: Binding<Int?>(
        get: { currentIndex },
        set: { _ in }
      ))
    }
    .clipShape(shape)
    .overlay {
      if screenshotSize != .zero && !hideBezels {
        ZStack {
          shape
            .stroke(.white, lineWidth: 6)

          shape
            .stroke(.black, lineWidth: 4)

          shape
            .stroke(.black, lineWidth: 6)
            .padding(4)
        }
        .padding(-7)
      }
    }
    .frame(
      maxWidth: screenshotSize.width == 0 ? nil : screenshotSize.width,
      maxHeight: screenshotSize.height == 0 ? nil : screenshotSize.height
    )
    .containerShape(RoundedRectangle(cornerRadius: deviceCornerRadius))
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  @ViewBuilder
  func TextContentView() -> some View {
    GeometryReader {
      let size = $0.size

      ScrollView(.horizontal) {
        HStack(spacing: 0) {
          ForEach(items.indices, id: \.self) { index in
            let item = items[index]
            let isActive = currentIndex == index

            VStack(spacing: 6) {
              if item.isProfilePage || item.isIncomePage {
                Spacer(minLength: 0)
              } else {
                Text(item.title)
                  .font(.title2)
                  .fontWeight(.semibold)
                  .lineLimit(1)
                  .foregroundStyle(.black)

                Text(item.subtitle)
                  .font(.callout)
                  .lineLimit(2)
                  .multilineTextAlignment(.center)
                  .foregroundStyle(.black.opacity(0.65))
              }
            }
            .frame(width: size.width)
            .compositingGroup()
            .blur(radius: isActive ? 0 : 30)
            .opacity(isActive ? 1 : 0)
          }
        }
        .scrollTargetLayout()
      }
      .scrollIndicators(.hidden)
      .scrollDisabled(true)
      .scrollTargetBehavior(.paging)
      .scrollClipDisabled()
      .scrollPosition(id: Binding<Int?>(
        get: { currentIndex },
        set: { _ in }
      ))
    }
  }

  @ViewBuilder
  func IndicatorView() -> some View {
    HStack(spacing: 6) {
      ForEach(items.indices, id: \.self) { index in
        let isActive = currentIndex == index

        Capsule()
          .fill(.black.opacity(isActive ? 1 : 0.25))
          .frame(width: isActive ? 25 : 6, height: 6)
      }
    }
    .padding(.bottom, 5)
  }

  @ViewBuilder
  func ContinueButton() -> some View {
    Button {
      if currentIndex == items.count - 1 {
        onComplete()
      }

      withAnimation(animation) {
        currentIndex = min(currentIndex + 1, items.count - 1)
      }
    } label: {
      Text("Continue")
        .fontWeight(.medium)
        .contentTransition(.numericText())
        .padding(.vertical, 6)
    }
    .tint(tint)
    .buttonStyle(.glassProminent)
    .buttonSizing(.flexible)
    .padding(.horizontal, 30)
  }

  @ViewBuilder
  func BackButton() -> some View {
    Button {
      withAnimation(animation) {
        currentIndex = max(currentIndex - 1, 0)
      }
    } label: {
      Image(systemName: "chevron.left")
        .font(.title3)
        .frame(width: 20, height: 30)
    }
    .buttonStyle(.glass)
    .buttonBorderShape(.circle)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(.leading, 15)
    .padding(.top, 5)
  }

  @ViewBuilder
  func VariableGlassBlur(_ radius: CGFloat) -> some View {
    let tint: Color = Color(uiColor: .systemBackground).opacity(0.82)
    Rectangle()
      .fill(tint)
      .glassEffect(.clear, in: .rect)
      .blur(radius: radius)
      .padding([.horizontal, .bottom], -radius * 2)
      .padding(.top, -radius / 2)
      .opacity(items[currentIndex].zoomScale > 1 ? 1 : 0)
      .ignoresSafeArea()
  }

  var deviceCornerRadius: CGFloat {
    if let imageSize = items.first?.screenshot?.size {
      let ratio = screenshotSize.height / imageSize.height
      let actualCornerRadius: CGFloat = 180
      return actualCornerRadius * ratio
    }

    return 0
  }

  struct Item: Identifiable, Hashable {
    var id: Int
    var title: String
    var subtitle: String
    var screenshot: UIImage?
    var zoomScale: CGFloat = 1
    var zoomAnchor: UnitPoint = .center
    var isProfilePage: Bool = false
    var isIncomePage: Bool = false
    var isBudgetCategoriesPage: Bool = false
  }

  var animation: Animation {
    .interpolatingSpring(duration: 0.65, bounce: 0, initialVelocity: 0)
  }

  private func dismissKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
  }
}
#endif

private struct ProfileNamePageView: View {
  @Binding var name: String
  var profileImageDataUri: String
  var animation: Animation
  var onProfileImagePress: () -> Void
  @State private var showContent: Bool = true

  var body: some View {
    GeometryReader {
      let size = $0.size

      VStack {
        GeometryReader {
          let size = $0.size

          ProfileHeaderView(
            name: name,
            profileImageDataUri: profileImageDataUri,
            onProfileImagePress: onProfileImagePress
          )
          .frame(width: size.width, height: size.height)
        }
        .compositingGroup()
        .blur(radius: showContent ? 0 : 30)
        .opacity(showContent ? 1 : 0)

        VStack(alignment: .leading, spacing: 10) {
          Spacer(minLength: 0)

          Text("What is\nyour name?")
            .font(.system(size: 40))
            .fontWeight(.black)

          VStack(spacing: 10) {
            NameFieldView(text: $name)

            Spacer(minLength: 10)
          }
          .padding(.top, 25)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .compositingGroup()
        .blur(radius: showContent ? 0 : 30)
        .opacity(showContent ? 1 : 0)
      }
      .frame(width: size.width, height: size.height)
    }
    .background(Color(uiColor: .systemBackground))
    .padding(15)
    .onAppear {
      animateContentIn()
    }
  }

  private func animateContentIn() {
    showContent = false

    DispatchQueue.main.async {
      withAnimation(animation) {
        showContent = true
      }
    }
  }
}

private struct ProfileHeaderView: View {
  var name: String
  var profileImageDataUri: String
  var onProfileImagePress: () -> Void

  var body: some View {
    VStack(spacing: 18) {
      Button(action: onProfileImagePress) {
        ZStack(alignment: .bottomTrailing) {
          Group {
            if let image = profileImage {
              Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
            } else {
              Circle()
                .fill(.gray.opacity(0.1))
                .overlay {
                  Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 54, weight: .regular))
                    .foregroundColor(.gray)
                }
            }
          }
          .frame(width: 150, height: 150)
          .clipShape(Circle())

          Circle()
            .fill(.black)
            .frame(width: 34, height: 34)
            .overlay {
              Image(systemName: "camera.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)
            }
        }
      }
      .buttonStyle(.plain)

      Text(name)
        .font(.title2)
        .fontWeight(.semibold)
        .foregroundColor(.black)
        .frame(minHeight: 32)
    }
    .padding(15)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  var profileImage: UIImage? {
    guard let commaIndex = profileImageDataUri.firstIndex(of: ",") else { return nil }
    let base64 = String(profileImageDataUri[profileImageDataUri.index(after: commaIndex)...])
    guard let data = Data(base64Encoded: base64) else { return nil }
    return UIImage(data: data)
  }
}

private struct NameFieldView: View {
  @Binding var text: String

  var body: some View {
    HStack(spacing: -10) {
      Image(systemName: "person")
        .font(.callout)
        .foregroundColor(.gray)
        .frame(width: 40, alignment: .leading)

      TextField("Name", text: $text)
    }
    .padding(.horizontal, 15)
    .padding(.vertical, 15)
    .background {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(.gray.opacity(0.1))
    }
  }
}

private struct IncomeSetupPageView: View {
  /// View Properties
  @State private var value: KeyPadValue = .init()
  @State private var period: IncomePeriod = .month

  var body: some View {
    let promptFontSize: CGFloat = 34

    VStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 0) {
        Text("What is your expected")
          .font(.system(size: promptFontSize))
          .fontWeight(.black)

        HStack(alignment: .firstTextBaseline, spacing: 0) {
          Menu {
            Picker("Income period", selection: $period) {
              ForEach(IncomePeriod.allCases) { period in
                Text(period.label).tag(period)
              }
            }
          } label: {
            Text(period.label)
              .font(.system(size: promptFontSize))
              .fontWeight(.black)
              .foregroundStyle(.black)
          }

          Text(" income?")
            .font(.system(size: promptFontSize))
            .fontWeight(.black)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .foregroundStyle(.black)
      .padding(.top, 28)

      /// Animated Text View
      TextView()
        .frame(height: 50)
        .overlay(alignment: .bottom) {
          if value.isExceedingMaxLength {
            Text("😅 Max Length Reached!")
              .font(.caption)
              .fontWeight(.semibold)
              .foregroundStyle(.red)
            .offset(y: 30)
          }
        }
        .padding(.bottom, 12)

      /// Custom Keypad View
      CustomKeypad()
    }
    .fontDesign(.rounded)
    .padding(15)
    .background(Color(uiColor: .systemBackground))
    .preferredColorScheme(.light)
  }

  @ViewBuilder
  func TextView() -> some View {
    HStack(spacing: 2) {
      Text("$")

      AnimatedTextView(value: $value)
    }
    /// You can even adjust the font size based on the length, but for the video tutorial, I’m using a fixed size of 40
    .font(.system(size: 40, weight: .black))
    .foregroundStyle(.black)
  }

  @ViewBuilder
  func CustomKeypad() -> some View {
    LazyVGrid(columns: Array(repeating: GridItem(spacing: 4), count: 3), spacing: 4) {
      /// 1-9 Buttons
      ForEach(1...9, id: \.self) { index in
        Button {
          withAnimation(.easeInOut(duration: 0.25)) {
            value.append(index)
          }
        } label: {
          Text("\(index)")
            .font(.title2.bold())
            .frame(maxWidth: .infinity)
            .frame(height: 62)
            .contentShape(.rect)
        }
      }

      Spacer()

      /// 0 & Back Button
      ForEach(["0", "delete.backward.fill"], id: \.self) { string in
        Button {
          withAnimation(.easeInOut(duration: 0.25)) {
            if string == "0" {
              value.append(0)
            } else {
              value.removeLast()
            }
          }
        } label: {
          Group {
            if string == "0" {
              Text("0")
            } else {
              Image(systemName: string)
            }
          }
          .font(.title2.bold())
          .frame(maxWidth: .infinity)
          .frame(height: 62)
          .contentShape(.rect)
        }
        /// Repeating behaviour for back button to erase all digits if long pressed!
        .buttonRepeatBehavior(string == "0" ? .disabled : .enabled)
      }
    }
    .buttonStyle(KeypadButtonStyle())
    .foregroundStyle(.black)
  }
}

private enum IncomePeriod: String, CaseIterable, Identifiable {
  case week
  case month
  case year

  var id: String {
    rawValue
  }

  var label: String {
    switch self {
    case .week: return "weekly"
    case .month: return "monthly"
    case .year: return "yearly"
    }
  }
}

private struct BudgetCategoriesPageView: View {
  private let needsTags: [String] = ["Groceries", "Rent", "Utilities", "Transportation", "Insurance", "Healthcare"]
  private let wantsTags: [String] = ["Dining", "Shopping", "Entertainment", "Travel", "Coffee", "Subscriptions"]
  private let savingsTags: [String] = ["Emergency Fund", "Retirement", "Investments", "Debt Payoff", "Down Payment"]

  var body: some View {
    let promptFontSize: CGFloat = 34

    VStack(alignment: .leading, spacing: 18) {
      Text("Which budget categories\nmatter to you?")
        .font(.system(size: promptFontSize))
        .fontWeight(.black)
        .foregroundStyle(.black)
        .fixedSize(horizontal: false, vertical: true)

      ScrollView(.vertical) {
        VStack(alignment: .leading, spacing: 18) {
          CategoryChipSection(title: "Needs", tags: needsTags, selectedColor: Self.needsColor)
          CategoryChipSection(title: "Wants", tags: wantsTags, selectedColor: Self.wantsColor)
          CategoryChipSection(title: "Savings", tags: savingsTags, selectedColor: Self.savingsColor)
        }
        .padding(14)
      }
      .scrollIndicators(.hidden)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
    .padding(15)
    .padding(.top, 58)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color(uiColor: .systemBackground))
    .preferredColorScheme(.light)
  }

  @ViewBuilder
  private func CategoryChipSection(title: String, tags: [String], selectedColor: Color) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption2)
        .fontWeight(.semibold)
        .foregroundStyle(.gray)

      ChipsView(tags: tags) { tag, isSelected in
        /// Your Custom View
        ChipView(tag, isSelected: isSelected, selectedColor: selectedColor)
      } didChangeSelection: { selection in
        print(selection)
      }
    }
  }

  @ViewBuilder
  func ChipView(_ tag: String, isSelected: Bool, selectedColor: Color) -> some View {
      HStack(spacing: 10) {
          Text(tag)
              .font(.callout)
              .foregroundStyle(isSelected ? .white : Color.primary)
          
          if isSelected {
              Image(systemName: "checkmark.circle.fill")
                  .foregroundStyle(.white)
          }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background {
          ZStack {
              Capsule()
                  .fill(Color(uiColor: .secondarySystemFill))
                  .opacity(!isSelected ? 1 : 0)
              
              Capsule()
                  .fill(selectedColor)
                  .opacity(isSelected ? 1 : 0)
          }
      }
  }

  private static let needsColor = Color(red: 78 / 255, green: 143 / 255, blue: 219 / 255)
  private static let wantsColor = Color(red: 215 / 255, green: 111 / 255, blue: 95 / 255)
  private static let savingsColor = Color(red: 72 / 255, green: 184 / 255, blue: 164 / 255)
}

struct ChipsView<Content: View, Tag: Equatable>: View where Tag: Hashable {
    var spacing: CGFloat = 10
    var animation: Animation = .easeInOut(duration: 0.2)
    var tags: [Tag]
    @ViewBuilder var content: (Tag, Bool) -> Content
    var didChangeSelection: ([Tag]) -> ()
    /// View Properties
    @State private var selectedTags: [Tag] = []
    var body: some View {
        CustomChipLayout(spacing: spacing) {
            ForEach(tags, id: \.self) { tag in
                content(tag, selectedTags.contains(tag))
                    .contentShape(.rect)
                    .onTapGesture {
                        withAnimation(animation) {
                            if selectedTags.contains(tag) {
                                selectedTags.removeAll(where: { $0 == tag })
                            } else {
                                selectedTags.append(tag)
                            }
                        }
                        
                        /// Callback after update!
                        didChangeSelection(selectedTags)
                    }
            }
        }
    }
}

fileprivate struct CustomChipLayout: Layout {
    var spacing: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        return .init(width: width, height: maxHeight(proposal: proposal, subviews: subviews))
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var origin = bounds.origin
        
        for subview in subviews {
            let fitSize = subview.sizeThatFits(proposal)
            
            if (origin.x + fitSize.width) > bounds.maxX {
                origin.x = bounds.minX
                origin.y += fitSize.height + spacing
                
                subview.place(at: origin, proposal: proposal)
                origin.x += fitSize.width + spacing
            } else {
                subview.place(at: origin, proposal: proposal)
                origin.x += fitSize.width + spacing
            }
        }
    }
    
    private func maxHeight(proposal: ProposedViewSize, subviews: Subviews) -> CGFloat {
        var origin: CGPoint = .zero
        
        for subview in subviews {
            let fitSize = subview.sizeThatFits(proposal)
            
            if (origin.x + fitSize.width) > (proposal.width ?? 0) {
                origin.x = 0
                origin.y += fitSize.height + spacing
                
                origin.x += fitSize.width + spacing
            } else {
                origin.x += fitSize.width + spacing
            }
            
            if subview == subviews.last {
                origin.y += fitSize.height
            }
        }
        
        return origin.y
    }
}

struct KeyPadValue {
  var stringValue: String = ""
  var stackViews: [Number] = []

  init(stringValue: String = "") {
    self.stringValue = stringValue

    for char in stringValue {
      stackViews.append(.init(value: String(char)))
    }

    updateCommas()
  }

  struct Number: Identifiable {
    var id: String = UUID().uuidString
    var value: String = ""
    var isComma: Bool = false
    /// Used for matched geometry effect
    var commaID: Int = 0
  }

  mutating func append(_ number: Int) {
    /// Limiting the maximum length and avoiding adding a zero as the first value
    guard !isExceedingMaxLength && (number == 0 ? !stringValue.isEmpty : true) else { return }

    stringValue.append(String(number))
    stackViews.append(.init(value: String(number)))

    updateCommas()
  }

  mutating func removeLast() {
    guard !stringValue.isEmpty else { return }

    stringValue.removeLast()
    stackViews.removeLast()

    updateCommas()
  }

  mutating func updateCommas() {
    guard let number = Int(stringValue) else { return }

    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.locale = Locale(identifier: localeFormat)

    if let formattedNumber = formatter.string(from: .init(value: number)) {
      /// Removing Previous Commas
      stackViews.removeAll(where: \.isComma)

      let stackWithCommas = formattedNumber.compactMap {
        let value = String($0)

        return Number(value: value, isComma: value == ",")
      }

      let onlyCommaArray = stackWithCommas.filter(\.isComma)

      /// Adding Commas to actual stack view without modifying other stack view ids
      for index in stackWithCommas.indices {
        let number = stackWithCommas[index]
        let commaIndex = onlyCommaArray.firstIndex(where: { $0.id == number.id }) ?? 0

        if number.isComma {
          stackViews.insert(
            .init(value: ",", isComma: true, commaID: commaIndex),
            at: index
          )
        }
      }
    }
  }

  /// Other Computed Properties
  var isEmpty: Bool {
    stringValue.isEmpty
  }

  var isExceedingMaxLength: Bool {
    /// Im only setting the max length to 9, but you can change this as per your needs!
    stringValue.count >= 9
  }

  var intValue: Int {
    Int(stringValue) ?? 0
  }

  var localeFormat: String {
    /// Update this as per your needs!
    "en_US"
  }
}

/// This is a resuable Example
struct AnimatedTextView: View {
  @Binding var value: KeyPadValue
  @Namespace private var animation
  var body: some View {
    Group {
      Text(value.isEmpty ? "0" : "")
        .frame(width: value.isEmpty ? nil : 0)
        .contentTransition(.numericText())
        .padding(.leading, 3)

      ForEach(value.stackViews) { number in
        Group {
          if number.isComma {
            Text(",")
              .contentTransition(.interpolate)
              .matchedGeometryEffect(id: number.commaID, in: animation)
          } else {
            Text(number.value)
              .contentTransition(.interpolate)
              .transition(.asymmetric(insertion: .push(from: .bottom), removal: .push(from: .top)))
          }
        }
      }
    }
  }
}

/// Custom Button Style for Keypad Buttons
struct KeypadButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background {
        RoundedRectangle(cornerRadius: 15)
          .fill(.gray.opacity(0.2))
          .opacity(configuration.isPressed ? 1 : 0)
          .padding(.horizontal, 5)
      }
      .animation(.easeInOut(duration: 0.25), value: configuration.isPressed)
  }
}

private struct IOSStyleOnboardingFallback: View {
  var onComplete: () -> Void

  var body: some View {
    ZStack {
      Color(uiColor: .systemBackground)
      VStack(spacing: 16) {
        Text("iOS 26 Onboarding")
          .font(.title2)
          .fontWeight(.semibold)
          .foregroundStyle(.black)
        Text("This preview requires iOS 26.")
          .font(.callout)
          .foregroundStyle(.black.opacity(0.65))
        Button("Done", action: onComplete)
          .buttonStyle(.borderedProminent)
      }
      .padding(24)
    }
    .preferredColorScheme(.light)
  }
}
