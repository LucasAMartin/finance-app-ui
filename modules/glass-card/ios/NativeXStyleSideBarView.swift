import ExpoModulesCore
import ExpoUI
import SwiftUI
import UIKit

public final class NativeXStyleSideBarViewProps: UIBaseViewProps {
  @Field var itemsJson: String = "[]"
  @Field var bottomItemsJson: String = "[]"
  @Field var profileName: String = ""
  @Field var profileImageUri: String?
  @Field var isDark: Bool = false

  var onNavigate = EventDispatcher()
  var onProfilePress = EventDispatcher()
}

public struct NativeXStyleSideBarView: ExpoSwiftUI.View {
  @ObservedObject public var props: NativeXStyleSideBarViewProps

  public init(props: NativeXStyleSideBarViewProps) {
    self.props = props
  }

  public var body: some View {
    XStyleSideBar(
      profileName: props.profileName,
      profileImageUri: props.profileImageUri,
      items: decodeItems(props.itemsJson),
      bottomItems: decodeItems(props.bottomItemsJson),
      onNavigate: { id in
        props.onNavigate(["id": id])
      },
      onProfilePress: {
        props.onProfilePress([:])
      }
    )
    .preferredColorScheme(props.isDark ? .dark : .light)
  }

  private func decodeItems(_ json: String) -> [XStyleSideBarItem] {
    guard let data = json.data(using: .utf8) else {
      return []
    }

    return (try? JSONDecoder().decode([XStyleSideBarItem].self, from: data)) ?? []
  }
}

private struct XStyleSideBarItem: Codable, Identifiable {
  let id: String
  let title: String
  let icon: String
}

private struct XStyleSideBar: View {
  let profileName: String
  let profileImageUri: String?
  let items: [XStyleSideBarItem]
  let bottomItems: [XStyleSideBarItem]
  let onNavigate: (String) -> Void
  let onProfilePress: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      profileCircle

      Text(profileName)
        .font(.title3)
        .fontWeight(.semibold)
        .lineLimit(1)
        .onTapGesture {
          onProfilePress()
        }

      clippedScrollView {
        ScrollView(.vertical) {
          VStack(alignment: .leading, spacing: 30) {
            ForEach(items) { item in
              CustomLabelButton(icon: item.icon, title: item.title) {
                onNavigate(item.id)
              }
            }

            divider

            ForEach(bottomItems) { item in
              CustomLabelButton(icon: item.icon, title: item.title) {
                onNavigate(item.id)
              }
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, 20)
        }
        .mask {
          Rectangle()
            .ignoresSafeArea()
        }
        .overlay(alignment: .top) {
          divider
            .padding(.horizontal, -15)
        }
        .padding(.top, 15)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding([.horizontal, .top], 15)
  }

  @ViewBuilder
  private var profileCircle: some View {
    if let uiImage = profileUIImage {
      Image(uiImage: uiImage)
        .resizable()
        .scaledToFill()
        .frame(width: 60, height: 60)
        .clipShape(Circle())
        .padding(.bottom, 10)
        .onTapGesture {
          onProfilePress()
        }
    } else if let initial = profileName.trimmingCharacters(in: .whitespacesAndNewlines).first {
      Circle()
        .fill(Color.primary)
        .frame(width: 60, height: 60)
        .overlay {
          Text(String(initial).uppercased())
            .font(.title2)
            .fontWeight(.semibold)
            .foregroundStyle(Color(uiColor: .systemBackground))
        }
        .padding(.bottom, 10)
        .onTapGesture {
          onProfilePress()
        }
    } else if #available(iOS 17.0, *) {
      Circle()
        .fill(.fill)
        .frame(width: 60, height: 60)
        .padding(.bottom, 10)
        .onTapGesture {
          onProfilePress()
        }
    } else {
      Circle()
        .fill(Color(uiColor: .tertiarySystemFill))
        .frame(width: 60, height: 60)
        .padding(.bottom, 10)
        .onTapGesture {
          onProfilePress()
        }
    }
  }

  private var profileUIImage: UIImage? {
    guard let profileImageUri, !profileImageUri.isEmpty else {
      return nil
    }

    if profileImageUri.hasPrefix("data:image/"),
       let commaIndex = profileImageUri.firstIndex(of: ",") {
      let base64 = String(profileImageUri[profileImageUri.index(after: commaIndex)...])
      guard let data = Data(base64Encoded: base64) else {
        return nil
      }
      return UIImage(data: data)
    }

    guard let url = URL(string: profileImageUri), url.isFileURL else {
      return nil
    }
    return UIImage(contentsOfFile: url.path)
  }

  @ViewBuilder
  private var divider: some View {
    if #available(iOS 17.0, *) {
      Divider()
        .background(.white.tertiary)
    } else {
      Divider()
        .background(Color.white.opacity(0.2))
    }
  }

  @ViewBuilder
  private func clippedScrollView<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    if #available(iOS 17.0, *) {
      content()
        .scrollClipDisabled()
    } else {
      content()
    }
  }

  @ViewBuilder
  func CustomLabelButton(
    icon: String,
    title: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: {
      action()
    }) {
      HStack(spacing: 10) {
        Image(systemName: icon)
          .font(.title3)
          .frame(width: 30)
          .symbolVariant(.fill)

        Text(title)
          .font(.title3)
          .fontWeight(.bold)
      }
      .foregroundStyle(Color.primary)
    }
  }
}
