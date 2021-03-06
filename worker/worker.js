addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(req) {
  let res;

  if (req.method !== "GET") {
    res = new Response("http method not allowed", { status: 405 });
    res.headers.set("Content-type", "text/plain");
    return res;
  }

  let cache = caches.default;
  res = await cache.match(req);
  if (res) {
    return res;
  }

  const params = getParams(req);

  if (params.errors.length) {
    res = new Response(params.errors.join("\r\n"), { status: 400 });
    res.headers.set("Content-type", "text/plain");
    return res;
  }

  const { process_image } = wasm_bindgen;

  let originReq = new Request(params.origin.toString(), req);
  let [originRes] = await Promise.all([
    cache.match(originReq),
    wasm_bindgen(wasm)
  ]);

  try {
    let originResToCache;
    if (!originRes) {
      originRes = await fetch(originReq);
      originResToCache = originRes.clone();
    }

    const data = await originRes.arrayBuffer();
    const output = process_image(new Uint8Array(data), params);
    const output_format = output.slice(-1);

    res = new Response(output.slice(0, -1), { status: 200 });
    res.headers.set("Content-type", getMimeType(VALID_FORMATS[output_format]));

    cache.put(req, res.clone());
    if (originResToCache) {
      cache.put(originReq, originResToCache);
    }
  } catch (e) {
    res = new Response(e.toString(), { status: 200 });
    res.headers.set("Content-type", "text/plain");
  }
  return res;
}

const VALID_FORMATS = ["png", "jpg", "jpeg"];
const VALID_MODES = ["fill", "fit", "limit"];

function getParams(req) {
  const errors = [];
  const params = {
    bg: [],
    dx: 0,
    dy: 0,
    errors,
    format: "",
    height: 0,
    mode: "",
    origin: "",
    quality: 90,
    scale: 1,
    width: 0
  };

  const reqUrl = new URL(req.url);
  const searchParams = reqUrl.searchParams;

  const format = getUrlExt(reqUrl);
  if (format) {
    params.format = format;
    if (!VALID_FORMATS.includes(params.format)) {
      errors.push(
        `image .extension must be one of ${format} ${VALID_FORMATS.join(", ")}`
      );
    }
  }

  if (searchParams.has("quality")) {
    params.quality = parseInt(searchParams.get("quality"), 10);
    if (params.quality > 100 || params.quality < 40) {
      errors.push("quality must be a number between 40 and 100");
    }
  }

  if (searchParams.has("origin")) {
    try {
      params.origin = new URL(searchParams.get("origin"));
    } catch (_) {}
  }

  if (!params.origin) {
    errors.push("origin must be a valid image URL");
  }

  if (searchParams.has("width")) {
    params.width = parseInt(searchParams.get("width"), 10);
    if (!(params.width > -1)) {
      errors.push("width must be a positive number");
    }
  }

  if (searchParams.has("height")) {
    params.height = parseInt(searchParams.get("height"), 10);
    if (!(params.height > -1)) {
      errors.push("height must be a positive number");
    }
  }

  if (!(params.width || params.height)) {
    errors.push("width and/or height must be provided");
  }

  if (searchParams.has("dx")) {
    params.dx = parseFloat(searchParams.get("dx"));
    if (!(params.dx >= -1 || params.dx <= 1)) {
      errors.push("dx must be a number between -1.0 and 1.0 (default: 0)");
    }
  }

  if (searchParams.has("dy")) {
    params.dy = parseFloat(searchParams.get("dy"));
    if (!(params.dy >= -1 || params.dy <= 1)) {
      errors.push("dy must be between -1.0 and 1.0 (default: 0)");
    }
  }

  if (searchParams.has("scale")) {
    params.scale = parseFloat(searchParams.get("scale"));
    if (!(params.scale > 0 || params.scale <= 10)) {
      errors.push("scale must be a non-zero number up to 10 (default: 1)");
    }
  }

  if (searchParams.has("mode")) {
    params.mode = String(searchParams.get("mode").toLowerCase());
  }

  if (!VALID_MODES.includes(params.mode)) {
    errors.push(`mode must be one of ${VALID_MODES.join(", ")}`);
  }

  if (searchParams.has("bg")) {
    const bg = getColor(String(searchParams.get("bg")).toLowerCase());
    if (bg) {
      params.bg = bg;
    } else {
      errors.push("bg must be a valid hex color between 000 and ffffff");
    }
  }

  return params;
}

function getUrlExt(url) {
  const extMatch = url.pathname.match(/\.(\w+)$/);
  return extMatch && extMatch[1].toLowerCase();
}

function getColor(hexStr) {
  if (hexStr.length === 3) {
    hexStr = hexStr
      .split("")
      .map(c => c + c)
      .join("");
  }
  if (hexStr.length === 6) {
    const output = [];
    for (let i = 0; i < 3; i++) {
      const hex = parseInt(hexStr.slice(0, 2), 16);
      if (hex === NaN) {
        return;
      }
      output.push(hex);
    }
    return output;
  }
}

function getMimeType(format) {
  return (
    {
      png: "image/png",
      jpg: "image/jpeg"
    }[format] || "application/octet-stream"
  );
}
