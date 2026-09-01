import CryptoKit
import Foundation
import Security

func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code)
}

guard CommandLine.arguments.count >= 3 else {
    fail("Expected an operation and device key ID.", code: 64)
}

let operation = CommandLine.arguments[1]
let keyID = CommandLine.arguments[2].lowercased()
guard keyID.range(of: "^[a-z0-9][a-z0-9._-]{2,63}$", options: .regularExpression) != nil else {
    fail("Device key ID is invalid.", code: 64)
}
guard SecureEnclave.isAvailable else {
    fail("This Mac does not provide the Secure Enclave required for Sirsi operations.")
}

let service = "org.mlp.sirsi-operations.device"
let itemQuery: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: keyID,
    kSecAttrService as String: service
]

func readWrappedKey() -> Data {
    var query = itemQuery
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { fail("This Mac is not enrolled for Sirsi operations.", code: 44) }
    guard status == errSecSuccess, let data = result as? Data else {
        fail("Device key lookup failed with status \(status).")
    }
    return data
}

func readPrivateKey() -> SecureEnclave.P256.Signing.PrivateKey {
    do {
        return try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: readWrappedKey())
    } catch {
        fail("The device-bound Sirsi operations key cannot be opened on this Mac: \(error).")
    }
}

func publicKeyPEM(_ privateKey: SecureEnclave.P256.Signing.PrivateKey) -> String {
    let encoded = privateKey.publicKey.derRepresentation.base64EncodedString(
        options: [.lineLength64Characters, .endLineWithLineFeed]
    )
    return "-----BEGIN PUBLIC KEY-----\n\(encoded)\n-----END PUBLIC KEY-----\n"
}

switch operation {
case "enroll":
    let replace = CommandLine.arguments.count >= 4 && CommandLine.arguments[3] == "replace"
    var existing: CFTypeRef?
    var lookup = itemQuery
    lookup[kSecReturnData as String] = true
    lookup[kSecMatchLimit as String] = kSecMatchLimitOne
    let existingStatus = SecItemCopyMatching(lookup as CFDictionary, &existing)
    if existingStatus == errSecSuccess && !replace {
        fail("This Mac already has a Sirsi operations credential. Use explicit replacement only for rotation.")
    }
    guard existingStatus == errSecSuccess || existingStatus == errSecItemNotFound else {
        fail("Device key lookup failed with status \(existingStatus).")
    }
    do {
        let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            [],
            nil
        )!
        let privateKey = try SecureEnclave.P256.Signing.PrivateKey(accessControl: access)
        let update: [String: Any] = [kSecValueData as String: privateKey.dataRepresentation]
        let status: OSStatus
        if existingStatus == errSecSuccess {
            status = SecItemUpdate(itemQuery as CFDictionary, update as CFDictionary)
        } else {
            var item = itemQuery
            item[kSecValueData as String] = privateKey.dataRepresentation
            item[kSecAttrLabel as String] = "Sirsi Operations device key (\(keyID))"
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { fail("Device-bound key could not be saved: \(status).") }
        let output: [String: Any] = [
            "key_id": keyID,
            "hardware_bound": true,
            "public_key_pem": publicKeyPEM(privateKey)
        ]
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]))
    } catch {
        fail("Secure Enclave key creation failed: \(error).")
    }
case "public":
    FileHandle.standardOutput.write(Data(publicKeyPEM(readPrivateKey()).utf8))
case "sign":
    let message = FileHandle.standardInput.readDataToEndOfFile()
    guard !message.isEmpty else { fail("Refusing to sign an empty request.", code: 65) }
    do {
        let signature = try readPrivateKey().signature(for: message)
        FileHandle.standardOutput.write(Data(signature.derRepresentation.base64EncodedString().utf8))
    } catch {
        fail("Secure Enclave signing failed: \(error).")
    }
case "delete-test-key":
    guard keyID.hasPrefix("test-") else { fail("Only test keys can be removed with this operation.", code: 64) }
    let status = SecItemDelete(itemQuery as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
        fail("Test key removal failed with status \(status).")
    }
default:
    fail("Unsupported Secure Enclave operation.", code: 64)
}
