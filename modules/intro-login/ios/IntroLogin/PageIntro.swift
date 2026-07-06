//
//  PageIntro.swift
//  Intro+Login
//
//  Created by Balaji on 30/03/23.
//

import SwiftUI

/// Page Intro Model
struct PageIntro: Identifiable, Hashable {
    var id: UUID = .init()
    var introAssetImage: String
    var title: String
    var subTitle: String
    var displaysAction: Bool = false
}

var pageIntros: [PageIntro] = [
    .init(introAssetImage: "Page 3", title: "What is\nyour name?", subTitle: "", displaysAction: true),
]
