"use client"

import { useActionState } from "react"
import { login } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OperonWordmark } from "@/components/brand/operon-mark"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, null)

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-8">
        <OperonWordmark className="mx-auto h-10 w-auto" />
        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardDescription className="font-mono text-xs uppercase tracking-wider">
              Acceso interno del equipo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="tomi@operon.dev"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {state?.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Ingresando…" : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
