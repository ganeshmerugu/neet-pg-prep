import { ProtectedLayout } from "@/components/layout/ProtectedLayout";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedLayout>{children}</ProtectedLayout>;
}
