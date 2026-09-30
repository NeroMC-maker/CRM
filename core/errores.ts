/** Error de negocio con un mensaje apto para mostrar al usuario. */
export class ErrorNegocio extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 403 | 404 | 409 = 400,
    public detalles?: string[],
  ) {
    super(message);
    this.name = 'ErrorNegocio';
  }
}
