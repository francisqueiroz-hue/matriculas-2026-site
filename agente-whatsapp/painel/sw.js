// Avisos da Lia no celular/computador do dono (Web Push).
self.addEventListener("push", (evento) => {
  let d = {};
  try { d = evento.data ? evento.data.json() : {}; } catch { d = { titulo: "Lia", corpo: evento.data ? evento.data.text() : "" }; }
  evento.waitUntil(self.registration.showNotification(d.titulo || "Lia", { body: d.corpo || "", data: { url: d.url || "/painel/" }, tag: "lia" }));
});
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(self.clients.openWindow(evento.notification.data.url));
});
