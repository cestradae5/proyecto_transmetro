import {
  AppBar,
  Box,
  Container,
  CssBaseline,
  Paper,
  Toolbar,
  Typography,
} from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";

import { appTheme } from "./theme/app-theme";

export function App() {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        <AppBar position="static">
          <Toolbar>
            <Typography component="span" variant="h6">
              Transmetro
            </Typography>
          </Toolbar>
        </AppBar>
        <Container component="main" maxWidth="lg" sx={{ py: 6 }}>
          <Paper sx={{ p: 4 }}>
            <Typography component="h1" gutterBottom variant="h4">
              Transmetro Administration
            </Typography>
            <Typography color="text.secondary">
              Platform scaffold is ready.
            </Typography>
          </Paper>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
