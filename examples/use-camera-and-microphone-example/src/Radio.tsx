export type Props = {
  set: (value: undefined | string) => void;
  value: undefined | string;
  name: string;
  radioClass?: string;
  options: { value: string | undefined; key: string }[];
};

export const Radio = ({ set, value, name, radioClass, options }: Props) => {
  return (
    <div className="flex flex-row items-center gap-1">
      {options.map((option) => {
        return (
          <div key={option.key} className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text mr-1">{option.value ?? "undefined"}</span>
              <input
                type="radio"
                name={name}
                className={`radio ${radioClass ?? ""}`}
                onChange={() => {
                  set(option.value);
                }}
                checked={option.value === value}
              />
            </label>
          </div>
        );
      })}

      <span>{name}</span>
    </div>
  );
};
