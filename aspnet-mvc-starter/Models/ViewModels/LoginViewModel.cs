using System.ComponentModel.DataAnnotations;

namespace TerraSinal.Web.Models.ViewModels;

public class LoginViewModel
{
    [Required(ErrorMessage = "O email é obrigatório.")]
    [EmailAddress(ErrorMessage = "Email inválido.")]
    [Display(Name = "Email")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "A palavra-passe é obrigatória.")]
    [DataType(DataType.Password)]
    [Display(Name = "Palavra-passe")]
    public string Password { get; set; } = string.Empty;

    [Display(Name = "Manter sessão")]
    public bool RememberMe { get; set; }

    public string? ReturnUrl { get; set; }
}
