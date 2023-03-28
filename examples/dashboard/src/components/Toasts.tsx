import toast, { ToastOptions } from "react-hot-toast";
export const showToastError = (message?: string, options?: ToastOptions) =>
  toast.custom(
    (t) => (
      <div
        onClick={() => toast.dismiss(t.id)}
        className={`alert alert-error shadow-lg ${t.visible ? "opacity-1" : "opacity-0"} max-w-lg transition-opacity`}
      >
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current flex-shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span> {message ?? "Error!"}</span>
        </div>
      </div>
    ),
    options
  );

export const showToastInfo = (message?: string, options?: ToastOptions) =>
  toast.custom(
    (t) => (
      <div>
        <div
          onClick={() => toast.dismiss(t.id)}
          className={`alert alert-info shadow-lg ${t.visible ? "opacity-1" : "opacity-0"} max-w-lg transition-opacity`}
        >
          <div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              className="stroke-current flex-shrink-0 w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
            <span>{message ?? "Info"}</span>
          </div>
        </div>
      </div>
    ),
    options
  );
