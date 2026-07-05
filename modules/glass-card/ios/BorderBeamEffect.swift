//
//  BorderBeamEffect.swift
//  BorderBeam
//
//  Created by Balaji Venkatesh on 30/04/26.
//

import SwiftUI

extension View {
    @available(iOS 17.0, *)
    @ViewBuilder
    func borderBeam(
        border: Color,
        hideFadeBorder: Bool = true,
        beam: [Color],
        beamBlur: CGFloat,
        cornerRadius: CGFloat,
        isEnabled: Bool = true
    ) -> some View {
        self
            .modifier(
                BorderBeamEffect(
                    border: border,
                    hideFadeBorder: hideFadeBorder,
                    beam: beam,
                    beamBlur: beamBlur,
                    cornerRadius: cornerRadius,
                    isEnabled: isEnabled
                )
            )
    }
}

@available(iOS 17.0, *)
struct BorderBeamEffect: ViewModifier {
    var border: Color
    var hideFadeBorder: Bool
    var beam: [Color]
    var beamBlur: CGFloat
    var cornerRadius: CGFloat
    var isEnabled: Bool
    func body(content: Content) -> some View {
        content
            .background {
                if isEnabled {
                    BorderBeamView()
                }
            }
    }
    
    @ViewBuilder
    private func BorderBeamView() -> some View {
        ZStack {
            /// OPTIONAL: Faded Border
            if !hideFadeBorder {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(border.tertiary, lineWidth: 0.6)
            }
            
            /// Using Keyframe Animator to animate the border beam!
            KeyframeAnimator(initialValue: 0.0, repeating: true) { value in
                let rotation = value * 360
                
                let borderGradient = AngularGradient(
                    colors: [.clear, border, .clear],
                    center: .center,
                    startAngle: .degrees(140 + rotation),
                    endAngle: .degrees(270 + rotation)
                )
                
                let beamGradient = LinearGradient(
                    colors: beam,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                
                /// Beam Gradient
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(beamGradient)
                    /// Inverse masking to show only some limited amount of beam gradient
                    .mask {
                        Rectangle()
                            .overlay {
                                RoundedRectangle(cornerRadius: cornerRadius)
                                    /// Using blur instead of padding, so that we can get smooth ending
                                    .blur(radius: beamBlur)
                                    .blendMode(.destinationOut)
                            }
                    }
                    .mask {
                        /// Masking it with the already having border gradient to sync with the border effect
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .fill(borderGradient)
                            .blur(radius: beamBlur / 1.5)
                            .padding(-beamBlur * 2)
                    }
                
                /// Border Gradient
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(borderGradient, lineWidth: 0.6)
            } keyframes: { _ in
                LinearKeyframe(1, duration: 2.5)
            }
        }
        .padding(0.5)
    }
}
