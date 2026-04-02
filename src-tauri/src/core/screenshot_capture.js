(function () {
  // only run inside iframes, not the main app frame
  if (window === window.top) return;

  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "MULTISTREAM_CAPTURE") return;

    var requestId = event.data.requestId;

    // find the primary video element in this frame
    var video = document.querySelector("video");
    if (!video || video.readyState < 2) {
      window.parent.postMessage(
        {
          type: "MULTISTREAM_CAPTURE_RESULT",
          requestId: requestId,
          success: false,
          error: "NO_VIDEO",
        },
        "*"
      );
      return;
    }

    try {
      var canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;

      var ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // this will throw SecurityError if the canvas is tainted (cross-origin)
      var dataUrl = canvas.toDataURL("image/png");

      window.parent.postMessage(
        {
          type: "MULTISTREAM_CAPTURE_RESULT",
          requestId: requestId,
          success: true,
          dataUrl: dataUrl,
          width: canvas.width,
          height: canvas.height,
        },
        "*"
      );
    } catch (err) {
      window.parent.postMessage(
        {
          type: "MULTISTREAM_CAPTURE_RESULT",
          requestId: requestId,
          success: false,
          error: "TAINTED_CANVAS",
        },
        "*"
      );
    }
  });
})();
