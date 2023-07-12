import { useCallback, useRef, useState } from "react";
import Hls from "hls.js";

const BIG_BUCK_BUNNY_SRC = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export default function HlsPlayback() {
  const hls = useRef<Hls | null>(null);
  const [src, setSrc] = useState(BIG_BUCK_BUNNY_SRC);
  const [srcInput, setSrcInput] = useState(src);

  const loadUrl = useCallback(
    (media: HTMLVideoElement | null) => {
      hls.current?.destroy();
      if (!media) return;
      hls.current = new Hls();
      hls.current.loadSource(src);
      hls.current.attachMedia(media);
    },
    [src]
  );

  return (
    <div className="w-[600px]">
      <video controls ref={loadUrl} className="w-full" />
      <div className="flex mt-2 w-full">
        <input value={srcInput} onChange={(e) => setSrcInput(e.target.value)} className="input input-bordered flex-1" />
        <button onClick={() => setSrc(srcInput)} className="btn btn-success ml-1">
          Update HLS source
        </button>
      </div>
    </div>
  );
}
