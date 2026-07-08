import SDWebImage
import SDWebImageAVIFCoder
import SDWebImageSVGCoder
import SDWebImageWebPCoder
import UIKit

enum NativeSheetLogoImage {
  static func image(fromLocalURL url: URL) -> UIImage? {
    guard url.isFileURL else {
      return nil
    }

    configureCoders()

    if let image = UIImage(contentsOfFile: url.path) {
      return image
    }

    guard let data = try? Data(contentsOf: url) else {
      return nil
    }

    return SDImageCodersManager.shared.decodedImage(with: data, options: nil)
      ?? UIImage(data: data)
  }

  private static func configureCoders() {
    _ = didConfigureCoders
  }

  private static let didConfigureCoders: Bool = {
    SDImageCodersManager.shared.addCoder(SDImageAVIFCoder.shared)
    SDImageCodersManager.shared.addCoder(SDImageSVGCoder.shared)
    SDImageCodersManager.shared.addCoder(SDImageWebPCoder.shared)
    return true
  }()
}
