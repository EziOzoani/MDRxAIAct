import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import MockupsGallery from "./pages/MockupsGallery";
import IntegratedDemo from "./pages/IntegratedDemo";
import NotFound from "./pages/NotFound";
// Demo mockups
import DemosIndex from "./pages/demos/index";
import PatientJourneyDemo from "./pages/demos/PatientJourneyDemo";
import ReactiveBearDemo from "./pages/demos/ReactiveBearDemo";
import LayersDemo from "./pages/demos/LayersDemo";
import StackingShieldsDemo from "./pages/demos/StackingShieldsDemo";
import ThermometerDemo from "./pages/demos/ThermometerDemo";

const queryClient = new QueryClient();

const App = () => {
  console.log("App component rendering...");
  
  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/mockups" element={<MockupsGallery />} />
          <Route path="/demo" element={<IntegratedDemo />} />
          {/* Demo mockup routes */}
          <Route path="/demos" element={<DemosIndex />} />
          <Route path="/demos/patient-journey" element={<PatientJourneyDemo />} />
          <Route path="/demos/reactive-bear" element={<ReactiveBearDemo />} />
          <Route path="/demos/layers" element={<LayersDemo />} />
          <Route path="/demos/shields" element={<StackingShieldsDemo />} />
          <Route path="/demos/thermometer" element={<ThermometerDemo />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
