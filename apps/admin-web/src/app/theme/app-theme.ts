import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    primary: {
      main: "#0057A8",
    },
    secondary: {
      main: "#F9A825",
    },
    background: {
      default: "#F5F7FA",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: 'Inter, "Segoe UI", sans-serif',
  },
});
