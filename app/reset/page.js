import ResetForm from "@/lib/ResetForm";

export default async function ResetPage({ searchParams }) {
  const params = await searchParams;
  return <ResetForm token={String(params?.token || "")} />;
}
