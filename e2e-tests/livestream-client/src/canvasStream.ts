/**
 * Creates a MediaStream from a canvas with an animated emoji.
 * This works reliably in CI environments like GitHub runners.
 */
export function createCanvasStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d")!;

  const emojis = ["🎥", "📹", "🎬", "🎞️", "📽️"];
  let frame = 0;
  let emojiIndex = 0;

  // Animate the canvas
  const animate = () => {
    // Background with gradient
    const gradient = ctx.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    gradient.addColorStop(0, `hsl(${frame % 360}, 70%, 50%)`);
    gradient.addColorStop(1, `hsl(${(frame + 120) % 360}, 70%, 50%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw emoji
    ctx.font = "120px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Bounce effect
    const bounce = Math.sin(frame * 0.1) * 30;
    const rotation = Math.sin(frame * 0.05) * 0.2;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 + bounce);
    ctx.rotate(rotation);
    ctx.fillText(emojis[emojiIndex], 0, 0);
    ctx.restore();

    // Draw frame counter
    ctx.fillStyle = "white";
    ctx.font = "20px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`Frame: ${frame}`, 10, 30);
    ctx.fillText(`Time: ${(frame / 30).toFixed(1)}s`, 10, 60);

    frame++;

    // Change emoji every 60 frames (~2 seconds at 30fps)
    if (frame % 60 === 0) {
      emojiIndex = (emojiIndex + 1) % emojis.length;
    }
  };

  // Start animation loop
  const intervalId = setInterval(animate, 1000 / 30); // 30 FPS

  // Initial draw
  animate();

  // Create stream from canvas
  const stream = canvas.captureStream(30); // 30 FPS

  // Store interval ID so we can clean it up
  (stream as MediaStream & { _intervalId?: NodeJS.Timeout })._intervalId =
    intervalId;

  return stream;
}

/**
 * Stops the canvas stream and cleans up the animation interval.
 */
export function stopCanvasStream(stream: MediaStream | null) {
  if (!stream) return;

  // Clean up animation interval if it exists
  const intervalId = (stream as MediaStream & { _intervalId?: number })
    ._intervalId;
  if (intervalId) {
    clearInterval(intervalId);
  }

  // Stop all tracks
  stream.getTracks().forEach((track) => track.stop());
}
