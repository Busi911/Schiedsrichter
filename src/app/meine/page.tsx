import { InstallHinweis } from "@/components/liga/installieren";
import { MeineMannschaften } from "@/components/liga/meine-mannschaften";

export default function MeinePage() {
  return (
    <>
      <InstallHinweis appName="Meine Mannschaften" appId="meine" />
      <MeineMannschaften />
    </>
  );
}
