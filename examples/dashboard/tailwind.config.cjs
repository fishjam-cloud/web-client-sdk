/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            spacing: {
                '100': '25rem', // 400 px
                '120': '30rem', // 480 px
                '125': '31.25rem', // 500 px
                '140': '35rem', // 560 px
                '160': '40rem', // 640 px
            }
        }
    },
    plugins: [
        require("daisyui")
    ],
}
