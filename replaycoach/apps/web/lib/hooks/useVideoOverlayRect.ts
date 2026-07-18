'use client';

import { useEffect, useState, type RefObject } from 'react';

export interface VideoOverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Computes the actual on-screen rectangle of a `<video>` element rendered
 * with `object-contain` inside `containerRef` — i.e. the letterboxed video
 * rect, not the full container box. An annotation canvas must be sized and
 * positioned to THIS rect, not the container, or normalized [0,1]
 * coordinates map against the wrong reference whenever the video's native
 * aspect ratio doesn't match the container's — and since the letterbox
 * amount changes on resize/fullscreen toggle, sizing to the container
 * instead reads as drift during playback, not just a static offset.
 *
 * Falls back to the full container rect (left:0, top:0) until the video's
 * intrinsic dimensions are known (before `loadedmetadata` fires).
 */
export function useVideoOverlayRect(
  containerRef: RefObject<HTMLElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
): VideoOverlayRect {
  const [containerDims, setContainerDims] = useState({ width: 0, height: 0 });
  const [videoIntrinsic, setVideoIntrinsic] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerDims({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoadedMetadata = () => {
      setVideoIntrinsic({ width: video.videoWidth, height: video.videoHeight });
    };
    // Metadata may already be available (e.g. src assigned before this
    // effect ran) — check immediately in addition to listening for future
    // loads, since ReplayPanel reassigns `video.src` imperatively across
    // replays without remounting the element.
    if (video.videoWidth && video.videoHeight) {
      onLoadedMetadata();
    }
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', onLoadedMetadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { width: cw, height: ch } = containerDims;
  const { width: vw, height: vh } = videoIntrinsic;
  if (!vw || !vh || !cw || !ch) {
    return { width: cw, height: ch, left: 0, top: 0 };
  }
  const containerAspect = cw / ch;
  const videoAspect = vw / vh;
  let width: number;
  let height: number;
  if (containerAspect > videoAspect) {
    height = ch;
    width = height * videoAspect;
  } else {
    width = cw;
    height = width / videoAspect;
  }
  return { width, height, left: (cw - width) / 2, top: (ch - height) / 2 };
}
