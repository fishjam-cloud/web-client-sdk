import Smelter, { setWasmBundleUrl } from "@swmansion/smelter-web-wasm";
import { useEffect, useState } from "react";

setWasmBundleUrl("/assets/smelter.wasm");

export const useSmelter = () => {
  const [smelter, setSmelter] = useState<Smelter>();

  useEffect(() => {
    const newSmelter = new Smelter();
    let cancel = false;

    const promise = (async () => {
      await newSmelter.init();
      await newSmelter.start();
      if (!cancel) setSmelter(newSmelter);
    })();

    return () => {
      cancel = true;
      promise.catch(() => {}).then(() => newSmelter?.terminate());
    };
  }, []);

  return smelter;
};
