import CashMarginClientPage from "@/app/previewma/CashMarginClientPage";

export default function ClientPage({ params }: { params: { client: string } }) {
  return <CashMarginClientPage clientName={decodeURIComponent(params.client)}  />;
}