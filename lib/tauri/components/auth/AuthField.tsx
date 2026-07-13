import { cn } from "@/lib/utils";

const inputClassName = cn(
  "w-full rounded-lg border border-[#232323] bg-[#232323] px-3 py-2.5",
  "text-gray-100 placeholder:text-gray-500",
  "focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
);

const labelClassName = "text-[12px] text-gray-300 font-medium mb-1 block";

interface AuthFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}

export function AuthField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required = true,
}: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={inputClassName}
      />
    </div>
  );
}

export function AuthButton({
  children,
  type = "button",
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full rounded-lg bg-[#232323] px-4 py-2.5 font-semibold text-gray-100 shadow-md transition-all",
        "hover:bg-[#2d2d2d] disabled:cursor-not-allowed disabled:opacity-60"
      )}
    >
      {children}
    </button>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center w-full gap-3">
      <div className="flex-grow border-t border-[#232323]" />
      <span className="text-gray-500 text-xs">{label}</span>
      <div className="flex-grow border-t border-[#232323]" />
    </div>
  );
}

export { inputClassName, labelClassName };
