// Khởi động ấm: biên dịch trước mọi chương trình shader và đẩy sẵn hình học, ảnh lên GPU ngay ở màn hình chờ.
// Trước đây three chỉ biên dịch vật liệu lần đầu nó lọt vào khung hình (nội thất chỉ hiện khi đến gần, ghế nhựa, kính, nước, mưa, tia lửa…),
// mỗi lần như vậy đứng hình 0,3–2,4 giây (kiểu chì màu: shader vật liệu vật lý rất dài). Ở đây hiện tạm MỌI đối tượng (trừ đèn: đổi số đèn
// là đổi cả khoá chương trình), tắt cắt theo khung nhìn, biên dịch song song rồi vẽ thử một khung vào sceneRT (lượt bóng đổ cũng biên dịch
// vật liệu độ sâu từng kiểu), sau đó trả lại đúng trạng thái cũ. Ảnh không đổi: khung vẽ thử không đi ra màn hình.
export async function warmUp(ctx) {
  const { scene, camera, pipeline } = ctx, R = pipeline.renderer, saved = [];
  scene.traverse((o) => { if (o.isLight) return; saved.push([o, o.visible, o.frustumCulled]); o.visible = true; o.frustumCulled = false; });
  try {
    if (R.compileAsync) await R.compileAsync(scene, camera);
    R.setRenderTarget(pipeline.sceneRT); R.render(scene, camera);
  } finally {
    for (const [o, v, f] of saved) { o.visible = v; o.frustumCulled = f; }
    R.setRenderTarget(null);
  }
}
