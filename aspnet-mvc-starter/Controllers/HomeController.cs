using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TerraSinal.Web.Controllers;

public class HomeController : Controller
{
    /// <summary>Observatório (SPA). Exige sessão iniciada: os dados e o modelo só são servidos a utilizadores autenticados.</summary>
    [Authorize(Roles = "Administrador,Investigador")]
    public IActionResult Index() => View();

    [AllowAnonymous]
    public IActionResult Error() => Content("Ocorreu um erro. Consulte os registos do servidor.");
}
