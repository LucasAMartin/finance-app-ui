//
//  Home.swift
//  Intro+Login
//
//  Created by Balaji on 30/03/23.
//

import SwiftUI
import UIKit

struct Home: View {
    /// View Properties
    @State private var activeIntro: PageIntro = pageIntros[0]
    @State private var emailID: String
    @State private var keyboardHeight: CGFloat = 0
    var profileImageDataUri: String
    var onNameChange: (String) -> Void

    init(initialName: String = "", profileImageDataUri: String = "", onNameChange: @escaping (String) -> Void = { _ in }) {
        self._emailID = State(initialValue: initialName)
        self.profileImageDataUri = profileImageDataUri
        self.onNameChange = onNameChange
    }

    var body: some View {
        GeometryReader {
            let size = $0.size
            
            IntroView(intro: $activeIntro, size: size, name: $emailID, profileImageDataUri: profileImageDataUri) {
                /// User Login/Signup View
                VStack(spacing: 10) {
                    /// Custom TextField
                    CustomTextField(text: $emailID, hint: "Name", leadingIcon: Image(systemName: "person"))
                    
                    Spacer(minLength: 10)
                    
                    Button {
                        onNameChange(emailID)
                    } label: {
                        Text("Continue")
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.vertical, 15)
                            .frame(maxWidth: .infinity)
                            .background {
                                Capsule()
                                    .fill(.black)
                            }
                    }
                }
                .padding(.top, 25)
            }
        }
        .background(Color(uiColor: .systemBackground))
        .padding(15)
        /// Manual Keyboard Push
        .offset(y: -keyboardHeight)
        /// Disabling Native Keyboard Push
        .ignoresSafeArea(.keyboard, edges: .all)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { output in
            if let info = output.userInfo, let height = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue.height {
                keyboardHeight = height
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardHeight = 0
        }
        .onChange(of: emailID) { newValue in
            onNameChange(newValue)
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.8, blendDuration: 0), value: keyboardHeight)
    }
}

struct Home_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}

/// Intro View
struct IntroView<ActionView: View>: View {
    @Binding var intro: PageIntro
    @Binding var name: String
    var size: CGSize
    var profileImageDataUri: String
    var actionView: ActionView
    
    init(intro: Binding<PageIntro>, size: CGSize, name: Binding<String>, profileImageDataUri: String, @ViewBuilder actionView: @escaping () -> ActionView) {
        self._intro = intro
        self._name = name
        self.size = size
        self.profileImageDataUri = profileImageDataUri
        self.actionView = actionView()
    }
    
    /// Animation Properties
    @State private var showView: Bool = false
    @State private var hideWholeView: Bool = false
    var body: some View {
        VStack {
            /// Image View
            GeometryReader {
                let size = $0.size
                
                ProfileHeaderView(name: name, profileImageDataUri: profileImageDataUri)
                    .frame(width: size.width, height: size.height)
            }
            /// Moving Up
            .offset(y: showView ? 0 : -size.height / 2)
            .opacity(showView ? 1 : 0)
            
            /// Tile & Action's
            VStack(alignment: .leading, spacing: 10) {
                Spacer(minLength: 0)
                
                Text(intro.title)
                    .font(.system(size: 40))
                    .fontWeight(.black)
                
                if !intro.subTitle.isEmpty {
                    Text(intro.subTitle)
                        .font(.caption)
                        .foregroundColor(.gray)
                        .padding(.top, 15)
                }
                
                if !intro.displaysAction {
                    Group {
                        Spacer(minLength: 25)
                        
                        /// Custom Indicator View
                        CustomIndicatorView(totalPages: filteredPages.count, currentPage: filteredPages.firstIndex(of: intro) ?? 0)
                            .frame(maxWidth: .infinity)
                        
                        Spacer(minLength: 10)
                        
                        Button {
                            changeIntro()
                        } label: {
                            Text("Next")
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .frame(width: size.width * 0.4)
                                .padding(.vertical, 15)
                                .background {
                                    Capsule()
                                        .fill(.black)
                                }
                        }
                        .frame(maxWidth: .infinity)
                    }
                } else {
                    /// Action View
                    actionView
                        .offset(y: showView ? 0 : size.height / 2)
                        .opacity(showView ? 1 : 0)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            /// Moving Down
            .offset(y: showView ? 0 : size.height / 2)
            .opacity(showView ? 1 : 0)
        }
        .offset(y: hideWholeView ? size.height / 2 : 0)
        .opacity(hideWholeView ? 0 : 1)
        /// Back Button
        .overlay(alignment: .topLeading) {
            /// Hiding it for Very First Page, Since there is no previous page present
            if intro != pageIntros.first {
                Button {
                    changeIntro(true)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.title2)
                        .fontWeight(.semibold)
                        .foregroundColor(.black)
                        .contentShape(Rectangle())
                }
                .padding(10)
                /// Animating Back Button
                /// Comes From Top When Active
                .offset(y: showView ? 0 : -200)
                /// Hides by Going back to Top When In Active
                .offset(y: hideWholeView ? -200 : 0)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.8, dampingFraction: 0.8, blendDuration: 0).delay(0.1)) {
                showView = true
            }
        }
    }
    
    /// Updating Page Intro's
    func changeIntro(_ isPrevious: Bool = false) {
        withAnimation(.spring(response: 0.8, dampingFraction: 0.8, blendDuration: 0)) {
            hideWholeView = true
        }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            /// Updating Page
            if let index = pageIntros.firstIndex(of: intro), (isPrevious ? index != 0 : index != pageIntros.count - 1) {
                intro = isPrevious ? pageIntros[index - 1] : pageIntros[index + 1]
            } else {
                intro = isPrevious ? pageIntros[0] : pageIntros[pageIntros.count - 1]
            }
            /// Re-Animating as Split Page
            hideWholeView = false
            showView = false
            
            withAnimation(.spring(response: 0.8, dampingFraction: 0.8, blendDuration: 0)) {
                showView = true
            }
        }
    }
    
    var filteredPages: [PageIntro] {
        return pageIntros.filter { !$0.displaysAction }
    }
}

private struct ProfileHeaderView: View {
    var name: String
    var profileImageDataUri: String

    var body: some View {
        VStack(spacing: 18) {
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

            Text(name)
                .font(.title3)
                .fontWeight(.semibold)
                .foregroundColor(.black)
                .frame(minHeight: 28)
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
