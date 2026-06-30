// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "Databuddy",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
        .tvOS(.v15),
        .watchOS(.v8),
    ],
    products: [
        .library(
            name: "Databuddy",
            targets: ["Databuddy"]
        ),
    ],
    targets: [
        .target(
            name: "Databuddy",
            path: "packages/sdk-swift/Sources/Databuddy"
        ),
        .testTarget(
            name: "DatabuddyTests",
            dependencies: ["Databuddy"],
            path: "packages/sdk-swift/Tests/DatabuddyTests"
        ),
    ]
)
