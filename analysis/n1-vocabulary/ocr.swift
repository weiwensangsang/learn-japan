import Foundation
import PDFKit
import Vision
import AppKit
let path = CommandLine.arguments[1]
guard let doc = PDFDocument(url: URL(fileURLWithPath:path)) else { fatalError("PDF") }
var result = ""
for i in 0..<doc.pageCount {
    guard let page = doc.page(at:i) else { continue }
    let img = page.thumbnail(of:NSSize(width:1400,height:2000),for:.mediaBox)
    var rect = NSRect(origin:.zero,size:img.size)
    guard let cg = img.cgImage(forProposedRect:&rect,context:nil,hints:nil) else {continue}
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["ja-JP", "en-US"]
    request.usesLanguageCorrection = true
    try VNImageRequestHandler(cgImage:cg).perform([request])
    result += (request.results ?? []).compactMap{$0.topCandidates(1).first?.string}.joined(separator:"\n") + "\n\u{000C}\n"
    fputs("page \(i+1)/\(doc.pageCount)\n",stderr)
}
try result.write(toFile:path.replacingOccurrences(of:".pdf",with:".ocr.txt"),atomically:true,encoding:.utf8)
