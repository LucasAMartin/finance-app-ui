//
//  ContentView.swift
//  User-Tutorial-Screen
//
//  Created by Balaji Venkatesh on 10/08/25.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        OneTimeOnBoarding(appStorageID: "HomeScreen") {
            NavigationStack {
                List {
                    HStack(spacing: 12) {
                        Image(.pic)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 40, height: 40)
                            .clipShape(.circle)
                        
                        VStack(alignment: .leading, spacing: 6) {
                            Text("iJustine")
                                .font(.callout)
                                .foregroundStyle(Color.primary)
                            
                            Text("Hi, There!")
                                .font(.caption)
                                .foregroundStyle(.gray)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 15)
                    .padding(.vertical, 10)
                    .onBoarding(2, cornerRadius: 15) {
                        DummyView()
                    }
                    .listRowInsets(.init(top: 0, leading: 0, bottom: 0, trailing: 0))
                    .listRowSeparator(.hidden, edges: .all)
                }
                .navigationTitle("Home")
            }
            .overlay(alignment: .topTrailing) {
                Button {
                    
                } label: {
                    Image(systemName: "person.circle.fill")
                        .font(.largeTitle)
                }
                .onBoarding(1){
                    DummyView()
                }
                .padding(15)
            }
            .overlay(alignment: .bottomTrailing) {
                Button {
                    
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.largeTitle)
                }
                .onBoarding(3) {
                    DummyView()
                }
                .padding(15)
            }
        } beginOnboarding: {
            
        } onBoardingFinished: {
            
        }
    }
    
    @ViewBuilder
    func DummyView() -> some View {
        Text("Lorem Ipsum is simply dummy text of the printing and typesetting industry.")
            .font(.caption)
            .multilineTextAlignment(.center)
    }
}

#Preview {
    ContentView()
}
