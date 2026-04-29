/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#002140",
          navyDeep: "#04223D",
          blue: "#0075DF",
          blueDark: "#0057A8",
          blueMid: "#0F447A",
        },
        cta: {
          orange: "#FF6600",
          orangeHover: "#0057A8",
        },
        accent: {
          teal: "#0F87AA",
        },
        surface: {
          white: "#FFFFFF",
          tint: "#F1F6FA",
          offWhite: "#F8F8F8",
        },
        ink: {
          DEFAULT: "#030303",
          body: "#333333",
          muted: "#494F54",
        },
        divider: {
          soft: "#E6E6E6",
          muted: "#DADADA",
          gray: "#BDBDBD",
        },
      },
      fontFamily: {
        display: ['"DM Sans"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        body: ['"Inter"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        btn: "10px",
      },
      boxShadow: {
        card: "0 10px 30px -12px rgba(0, 33, 64, 0.15)",
        input: "0 1px 2px rgba(0,0,0,0.04)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 300ms ease-out",
      },
    },
  },
  plugins: [],
};
