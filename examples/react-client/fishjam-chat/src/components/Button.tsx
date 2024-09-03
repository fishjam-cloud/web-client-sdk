export const Button = (
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  return (
    <button
      {...props}
      className={`px-2 py-1 bg-gray-500 text-white rounded-md disabled:bg-gray-300 ${props.className}`}
    />
  );
};
