import fs from 'node:fs/promises'

const mimeTypeSignatures: { [key: string]: Buffer } = {
    'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
    'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    'image/gif': Buffer.from([0x47, 0x49, 0x46, 0x38]),
}

export const validateMimeType = async (
    filePath: string
): Promise<string | null> => {
    const file = await fs.open(filePath, 'r')
    const buffer = Buffer.alloc(256)
    await file.read(buffer, 0, buffer.length, 0)
    await file.close()
    const mimeType = Object.entries(mimeTypeSignatures).find(([_, signature]) =>
        buffer.slice(0, signature.length).equals(signature)
    )
    if (mimeType) {
        return mimeType[0]
    }
    const сontent = buffer.toString('utf8').trim()
    if (сontent.startsWith('<?xml') || сontent.startsWith('<svg')) {
        return 'image/svg+xml'
    }
    return null
}
