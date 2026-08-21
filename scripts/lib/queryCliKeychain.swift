import Foundation
import Security

func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code)
}

guard CommandLine.arguments.count == 4 else {
    fail("Expected operation, account, and service.", code: 64)
}

let operation = CommandLine.arguments[1]
let account = CommandLine.arguments[2]
let service = CommandLine.arguments[3]
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: account,
    kSecAttrService as String: service
]

switch operation {
case "read":
    var request = query
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &result)
    if status == errSecItemNotFound { exit(44) }
    guard status == errSecSuccess, let data = result as? Data else {
        fail("Keychain read failed with status \(status).")
    }
    FileHandle.standardOutput.write(data)
case "write":
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard !data.isEmpty else { fail("Refusing to save an empty Keychain value.", code: 65) }
    let updateStatus = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if updateStatus == errSecItemNotFound {
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrLabel as String] = "MLP Query Project CLI session"
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else { fail("Keychain write failed with status \(addStatus).") }
    } else if updateStatus != errSecSuccess {
        fail("Keychain update failed with status \(updateStatus).")
    }
case "delete":
    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
        fail("Keychain delete failed with status \(status).")
    }
default:
    fail("Unsupported Keychain operation.", code: 64)
}
