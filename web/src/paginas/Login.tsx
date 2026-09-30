import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Campo, ErrorCaja } from '../ui';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post('/auth/login', { email, password });
      await qc.invalidateQueries({ queryKey: ['yo'] });
      nav((loc.state as { desde?: string } | null)?.desde ?? '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <form className="tarjeta" onSubmit={entrar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="marca" style={{ padding: 0 }}>
          <div className="marca-logo">TL</div>
          <div className="marca-texto">
            Tulicencia.com.pe
            <small>Sistema interno de la escuela</small>
          </div>
        </div>
        <Campo etiqueta="Correo">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Campo>
        <Campo etiqueta="Contraseña">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Campo>
        <ErrorCaja error={error} />
        <button className="btn grande" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
