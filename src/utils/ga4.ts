type GaEventParams = Record<string, string>;

function getFileInfo(fileUrl: string) {
  const cleanUrl = fileUrl.split("#")[0].split("?")[0];
  const fileName = cleanUrl.split("/").pop() || "";
  const fileType = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase() || ""
    : "";
  const baseName = fileName.replace(/\.[^/.]+$/, "");

  return {
    fileName,
    fileType,
    baseName,
  };
}

function trackGaEvent(eventName: string, params: GaEventParams) {
  if (typeof window === "undefined") return;

  const payload = {
    ...params,
    page_location: window.location.href,
  };

  if (import.meta.env.DEV) {
    console.log("[ga4]", eventName, payload);
  }

  if (typeof window.gtag !== "function") return;

  window.gtag("event", eventName, payload);
}

export function trackColoringPageOpen(
  imageUrl: string,
  imageTitle?: string,
  category = "coloring",
) {
  const info = getFileInfo(imageUrl);

  trackGaEvent("coloring_page_open", {
    image_name: imageTitle || info.baseName,
    image_category: category,
    file_url: imageUrl,
    file_type: info.fileType,
  });
}

export function trackWallpaperView(
  imageUrl: string,
  wallpaperTitle?: string,
  category = "wallpaper",
) {
  const info = getFileInfo(imageUrl);

  trackGaEvent("wallpaper_view", {
    wallpaper_name: wallpaperTitle || info.baseName,
    wallpaper_category: category,
    file_url: imageUrl,
    file_type: info.fileType,
  });
}

export function trackWallpaperDownload(
  imageUrl: string,
  wallpaperTitle?: string,
  category = "wallpaper",
) {
  const info = getFileInfo(imageUrl);

  trackGaEvent("wallpaper_download", {
    wallpaper_name: wallpaperTitle || info.baseName,
    wallpaper_category: category,
    file_url: imageUrl,
    file_type: info.fileType,
  });
}
