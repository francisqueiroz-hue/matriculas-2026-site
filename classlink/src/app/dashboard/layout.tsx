import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { UserProvider } from "@/components/UserContext";
import { Navbar } from "@/components/Navbar";
import { Sidebar } from "@/components/Sidebar";
import { PushRegister } from "@/components/PushRegister";

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
      }}
    >
      <Navbar />
      <PushRegister />
      <div className="flex flex-1">
        <Sidebar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </div>
    </UserProvider>
  );
}
