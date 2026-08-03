import { Toaster } from "sonner";

export function ToastHost() {
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        className: "font-sans",
      }}
    />
  );
}
