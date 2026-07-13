"use client";

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Container,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
} from "@mui/material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useAuth } from "@tauri/components/auth/AuthProvider";

interface ProcessInfo {
  name: string;
  cpu_usage: number;
  memory: number;
  uptime: number;
  focus_time: number;
  tab_focus_times: Record<string, number>;
}

export function TaskManager() {
  const { userName, signOut } = useAuth();
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [activeWindow, setActiveWindow] = useState("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchProcesses = async () => {
    try {
      const data = await invoke<ProcessInfo[]>("get_processes");
      setProcesses(data);
    } catch (error) {
      console.error("Failed to fetch processes:", error);
    }
  };

  const exportToCsv = async () => {
    try {
      const csvContent = await invoke<string>("export_processes_to_csv");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "processes.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export processes to CSV:", error);
    }
  };

  const refreshActiveWindow = async () => {
    try {
      const data = await invoke<string>("get_active_window_title");
      setActiveWindow(data);
    } catch (error) {
      console.error("Failed to get active window:", error);
    }
  };

  useEffect(() => {
    fetchProcesses();
    refreshActiveWindow();
    const interval = setInterval(() => {
      fetchProcesses();
      refreshActiveWindow();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredProcesses = processes.filter((process) =>
    process.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isMounted) {
    return null;
  }

  return (
    <Container sx={{ py: 4 }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Typography variant="h4" gutterBottom>
            FocusAnalyze Desktop
          </Typography>
          {userName ? (
            <Typography variant="body2" color="text.secondary">
              Signed in as {userName}
            </Typography>
          ) : null}
        </div>
        <Button variant="outlined" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
      <Typography variant="subtitle1" gutterBottom color="text.secondary">
        System analytics and focus-time tracking
      </Typography>
      <TextField
        label="Search"
        variant="outlined"
        fullWidth
        margin="normal"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <Button variant="contained" color="primary" onClick={exportToCsv}>
        Export to CSV
      </Button>
      <Button
        variant="outlined"
        color="secondary"
        style={{ marginLeft: "10px" }}
        onClick={refreshActiveWindow}
      >
        Refresh Active Window
      </Button>
      <Typography variant="subtitle2" style={{ marginTop: "10px" }} gutterBottom>
        Active Window: {activeWindow || "(none detected)"}
      </Typography>
      <BarChart
        width={900}
        height={300}
        data={filteredProcesses}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="cpu_usage" fill="#8884d8" name="CPU %" />
        <Bar dataKey="memory" fill="#82ca9d" name="Memory (bytes)" />
        <Bar dataKey="focus_time" fill="#ffc658" name="Focus time (s)" />
      </BarChart>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>CPU Usage</TableCell>
              <TableCell>Memory</TableCell>
              <TableCell>Uptime</TableCell>
              <TableCell>Focus Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredProcesses.map((process) => (
              <TableRow key={process.name}>
                <TableCell>{process.name}</TableCell>
                <TableCell>{process.cpu_usage.toFixed(1)}%</TableCell>
                <TableCell>{(process.memory / 1024 / 1024).toFixed(2)} MB</TableCell>
                <TableCell>{process.uptime}s</TableCell>
                <TableCell>{process.focus_time}s</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
