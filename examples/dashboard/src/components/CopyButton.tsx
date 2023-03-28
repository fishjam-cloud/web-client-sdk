import { showToastInfo } from "./Toasts";

export const CopyToClipboardButton = ({ text }: { text: string }) => {
  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(text);
    showToastInfo("Copied to clipboard", { duration: 1000 });
  };
  return (
    <button className="btn btn-sm m-2" onClick={copyTokenToClipboard}>
      Copy
    </button>
  );
};
