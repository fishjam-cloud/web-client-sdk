import { useLivestream } from "@fishjam-cloud/react-client";
import { useState } from "react";

import VideoPlayer from "./VideoPlayer";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export const App = () => {
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("https://fishjam.io/api/v1/live/api/whep");

  const { connect, disconnect, stream } = useLivestream();

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>View a live stream</CardTitle>
        <CardDescription>Enter your viewer token below</CardDescription>
      </CardHeader>
      <CardContent>
        <form>
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="url">Email</Label>
              <Input id="url" type="url" value={url} required />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input id="password" type="password" required />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button type="submit" className="w-full">
          Login
        </Button>
      </CardFooter>
    </Card>
  );
};
