import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { UserProvider } from "@/components/UserContext";
import { Navbar } from "@/components/Navbar";
import { Sidebar } from "@/components/Sidebar";
import { PushRegister } from "@/components/PushRegister";
import { IosInstallBanner } from "@/components/IosInstallBanner";
import { AndroidInstallBanner } from "@/components/AndroidInstallBanner";
import { RematriculaBanner } from "@/components/RematriculaBanner";
import { ContratosPendentesBanner } from "@/components/ContratosPendentesBanner";
import { AvisosMensagensProvider, ConviteAtivarAvisos } from "@/components/AvisosMensagens";
import { GuardaVisibilidade } from "@/components/GuardaVisibilidade";
import { areasBloqueadasDoUsuario } from "@/lib/visibilidade-server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      schoolId: true,
      isCoordenacao: true,
      school: { select: { name: true } },
    },
  });
  if (!user) redirect("/login");
  // O que a direção desligou para este perfil (tela Configurações): some do menu e da tela.
  const areasBloqueadas = await areasBloqueadasDoUsuario(user);

  return (
    <UserProvider
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        schoolName: user.school.name,
        isCoordenacao: user.isCoordenacao,
        areasBloqueadas,
      }}
    >
      <AvisosMensagensProvider>
        {/* Todas as contas usam o tema colorido das famílias (ver `.tema-familia`
            em globals.css), para a direção e a coordenação verem o app como os
            pais veem. */}
        <div className="tema-familia flex flex-1 flex-col">
          <Navbar />
          <PushRegister />
          <div className="flex flex-1">
            <Sidebar />
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
              <IosInstallBanner />
              <AndroidInstallBanner />
              <ConviteAtivarAvisos />
              <ContratosPendentesBanner />
              <RematriculaBanner />
              <GuardaVisibilidade>{children}</GuardaVisibilidade>
            </main>
          </div>
        </div>
      </AvisosMensagensProvider>
    </UserProvider>
  );
}
