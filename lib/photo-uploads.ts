'use client'

// L4 · Inspection wizard speed.
//
// A photo used to hold the inspector at the confirm screen until it finished
// uploading — eighteen short waits across a walk-around. Now the photo appears
// in its slot straight from the device and the upload runs behind it.
//
// Every upload started that way is registered here, and the wizard waits on
// this list once, at the end, before it builds the report. That way a photo can
// never be left as device-only data in the saved inspection: the waiting happens
// once, where it costs nothing, instead of after every shot.

const pending = new Set<Promise<unknown>>()

export function trackUpload<T>(job: Promise<T>): Promise<T> {
  pending.add(job)
  job.catch(() => { /* the caller reports failures */ }).finally(() => pending.delete(job))
  return job
}

export function pendingUploadCount(): number {
  return pending.size
}

/** Resolves once every in-flight photo upload has settled. */
export async function awaitPendingUploads(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled(Array.from(pending))
  }
}
