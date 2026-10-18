// Getting a backup file out of the app, and reading one back in.
//
// iPhone: the app opens the share sheet, where you pick "Save to Files" or
// AirDrop it to the Mac. Mac: the file goes to your Downloads folder.

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled'

/** True on phones and tablets (a touch screen with no mouse). */
function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches
  } catch {
    return false
  }
}

function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function saveTextFile(text: string, filename: string): Promise<SaveOutcome> {
  const file = new File([text], filename, { type: 'application/json' })
  if (isTouchDevice() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (err) {
      // Closing the share sheet counts as a "failure"; it just means "never mind".
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Anything else (e.g. sharing not allowed right now): fall back to a normal download.
    }
  }
  download(file)
  return 'downloaded'
}

export function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}
